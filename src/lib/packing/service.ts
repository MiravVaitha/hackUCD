import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db, type Tx } from "@/db/client";
import {
  orderItems,
  orders,
  packingScans,
  packingSessions,
  products,
  shipments,
  type FulfilmentStatus,
  type Order,
  type OrderItem,
  type PackingException,
  type PackingExceptionKind,
  type PackingSession,
  type PackingSessionStatus,
  type ScanKind,
  type ScanMethod,
  type ScanResult,
  type Shipment,
} from "@/db/schema";
import type { SessionContext } from "@/lib/auth/session";
import { getEvidenceFiles, saveEvidenceFile, toAttachment } from "@/lib/evidence/files";
import { appendLedgerEvent } from "@/lib/ledger/append";
import { formatAddress, formatDuration } from "@/lib/utils";
import {
  normaliseProductCode,
  normaliseTrackingCode,
  parseOrderBarcode,
} from "./barcodes";

// ---------------------------------------------------------------------------
// Types shared with the packing station UI
// ---------------------------------------------------------------------------

export type PackingStep = "items" | "contents_photo" | "label" | "label_photo" | "review" | "done";

export type PackingItemState = {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  art: string;
  quantity: number;
  verified: number;
};

export type PackingPhotoState = { fileId: string; sha256: string } | null;

export type PackingState = {
  sessionId: string;
  orderId: string;
  orderNumber: string;
  status: PackingSessionStatus;
  step: PackingStep;
  fulfilmentStatus: FulfilmentStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  packerName: string | null;
  stationLabel: string;
  customerName: string | null;
  shipTo: string[];
  items: PackingItemState[];
  carrier: string | null;
  trackingNumber: string | null;
  labelVerified: boolean;
  contentsPhoto: PackingPhotoState;
  labelPhoto: PackingPhotoState;
  exceptions: PackingException[];
};

export type ScanOutcome = {
  /** True when the scan moved the session forward. */
  ok: boolean;
  result: ScanResult | "wrong_order" | "not_expected" | "already_verified";
  /** Shown to the packer, large. */
  title: string;
  message: string;
  itemId?: string;
  state: PackingState;
};

export class PackingError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "PackingError";
  }
}

const PACKABLE_PAYMENT = ["paid", "partially_refunded", "disputed"] as const;
const SKIPPABLE: Record<"contents_photo" | "label" | "label_photo", PackingExceptionKind> = {
  contents_photo: "photo_skipped",
  label: "label_not_scanned",
  label_photo: "photo_skipped",
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function hasOverride(session: PackingSession, kind: PackingExceptionKind, code?: string): boolean {
  return session.exceptions.some(
    (exception) => exception.overridden && exception.kind === kind && (code === undefined || exception.code === code),
  );
}

export function computeStep(session: PackingSession, items: OrderItem[]): PackingStep {
  if (session.status === "completed" || session.status === "completed_with_exceptions") return "done";

  const allItems = items.every((item) => (session.itemCounts[item.id] ?? 0) >= item.quantity);
  if (!allItems && !hasOverride(session, "short_pack")) return "items";
  if (!session.contentsPhotoFileId && !hasOverride(session, "photo_skipped", "contents_photo")) {
    return "contents_photo";
  }
  if (!session.labelVerified && !hasOverride(session, "label_not_scanned")) return "label";
  if (!session.labelPhotoFileId && !hasOverride(session, "photo_skipped", "label_photo")) {
    return "label_photo";
  }
  return "review";
}

async function buildState(
  tx: Tx | typeof db,
  merchantId: string,
  session: PackingSession,
  order: Order,
  items: OrderItem[],
  shipment: Shipment | null,
): Promise<PackingState> {
  const photoIds = [session.contentsPhotoFileId, session.labelPhotoFileId].filter(
    (value): value is string => Boolean(value),
  );
  const files = await getEvidenceFiles(photoIds, merchantId, tx);
  const photo = (fileId: string | null): PackingPhotoState => {
    const file = files.find((candidate) => candidate.id === fileId);
    return file ? { fileId: file.id, sha256: file.sha256 } : null;
  };

  return {
    sessionId: session.id,
    orderId: order.id,
    orderNumber: order.number,
    status: session.status,
    step: computeStep(session, items),
    fulfilmentStatus: order.fulfilmentStatus,
    startedAt: session.startedAt.toISOString(),
    completedAt: session.completedAt?.toISOString() ?? null,
    durationMs: session.durationMs,
    packerName: session.packerName,
    stationLabel: session.stationLabel,
    customerName: order.customerName,
    shipTo: formatAddress(order.shippingAddress),
    items: items.map((item) => ({
      id: item.id,
      sku: item.sku,
      barcode: item.barcode,
      name: item.name,
      art: item.art,
      quantity: item.quantity,
      verified: session.itemCounts[item.id] ?? 0,
    })),
    carrier: shipment ? `${shipment.carrier} ${shipment.service}` : null,
    trackingNumber: shipment?.trackingNumber ?? null,
    labelVerified: session.labelVerified,
    contentsPhoto: photo(session.contentsPhotoFileId),
    labelPhoto: photo(session.labelPhotoFileId),
    exceptions: session.exceptions,
  };
}

type Loaded = {
  session: PackingSession;
  order: Order;
  items: OrderItem[];
  shipment: Shipment | null;
};

/** Load and lock a packing session for an update. */
async function lockSession(tx: Tx, merchantId: string, sessionId: string): Promise<Loaded> {
  const [session] = await tx
    .select()
    .from(packingSessions)
    .where(and(eq(packingSessions.id, sessionId), eq(packingSessions.merchantId, merchantId)))
    .for("update");
  if (!session) throw new PackingError("That packing session could not be found.", 404);

  const [order] = await tx.select().from(orders).where(eq(orders.id, session.orderId)).limit(1);
  const items = await tx
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, session.orderId))
    .orderBy(asc(orderItems.name));
  const [shipment] = await tx.select().from(shipments).where(eq(shipments.orderId, session.orderId)).limit(1);
  return { session, order, items, shipment: shipment ?? null };
}

function requireInProgress(session: PackingSession): void {
  if (session.status !== "in_progress") {
    throw new PackingError("This order has already been packed.", 409);
  }
}

function actor(context: SessionContext) {
  return { type: "user" as const, id: context.user.id, label: context.user.name };
}

function exception(
  kind: PackingExceptionKind,
  overridden: boolean,
  details: { code?: string; orderItemId?: string; note?: string } = {},
): PackingException {
  return { kind, overridden, at: new Date().toISOString(), ...details };
}

async function logScan(
  tx: Tx,
  sessionId: string,
  scan: { code: string; kind: ScanKind; result: ScanResult; method: ScanMethod; orderItemId?: string; note?: string },
): Promise<void> {
  await tx.insert(packingScans).values({
    sessionId,
    code: scan.code.slice(0, 200),
    kind: scan.kind,
    result: scan.result,
    method: scan.method,
    orderItemId: scan.orderItemId ?? null,
    note: scan.note ?? null,
  });
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export type PackQueueEntry = {
  order: Order;
  units: number;
  lines: number;
  inProgress: boolean;
};

/** Paid orders waiting to be packed, oldest first. */
export async function listPackQueue(merchantId: string): Promise<PackQueueEntry[]> {
  const rows = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        inArray(orders.paymentStatus, [...PACKABLE_PAYMENT]),
        inArray(orders.fulfilmentStatus, ["unfulfilled", "packing"]),
      ),
    )
    .orderBy(asc(orders.placedAt))
    .limit(100);
  if (rows.length === 0) return [];

  const items = await db
    .select({ orderId: orderItems.orderId, quantity: orderItems.quantity })
    .from(orderItems)
    .where(
      inArray(
        orderItems.orderId,
        rows.map((row) => row.id),
      ),
    );

  return rows.map((order) => {
    const own = items.filter((item) => item.orderId === order.id);
    return {
      order,
      units: own.reduce((sum, item) => sum + item.quantity, 0),
      lines: own.length,
      inProgress: order.fulfilmentStatus === "packing",
    };
  });
}

/** Orders packed most recently, for the "just packed" list on the station. */
export async function listRecentlyPacked(merchantId: string, limit = 5): Promise<Order[]> {
  return db
    .select()
    .from(orders)
    .where(and(eq(orders.merchantId, merchantId), eq(orders.fulfilmentStatus, "packed")))
    .orderBy(desc(orders.packedAt))
    .limit(limit);
}

/** Resolve a scanned packing-slip code or typed order number to an order number. */
export async function findOrderNumberByCode(merchantId: string, code: string): Promise<string | null> {
  const number = parseOrderBarcode(code);
  if (!number) return null;
  const [order] = await db
    .select({ number: orders.number })
    .from(orders)
    .where(and(eq(orders.merchantId, merchantId), eq(orders.number, number)))
    .limit(1);
  return order?.number ?? null;
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

/** Start packing an order, or resume the session already open for it. */
export async function startPackingSession(
  context: SessionContext,
  orderNumber: string,
  stationLabel?: string,
): Promise<PackingState> {
  const merchantId = context.merchant.id;

  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.merchantId, merchantId), eq(orders.number, orderNumber.toUpperCase())))
      .for("update");
    if (!order) throw new PackingError(`Order ${orderNumber} could not be found.`, 404);

    const items = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
      .orderBy(asc(orderItems.name));
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.orderId, order.id)).limit(1);

    const [latest] = await tx
      .select()
      .from(packingSessions)
      .where(eq(packingSessions.orderId, order.id))
      .orderBy(desc(packingSessions.startedAt))
      .limit(1);

    // Already packed: show the finished session rather than starting again.
    if (latest && latest.status !== "in_progress" && latest.status !== "abandoned") {
      return buildState(tx, merchantId, latest, order, items, shipment ?? null);
    }
    if (latest && latest.status === "in_progress") {
      return buildState(tx, merchantId, latest, order, items, shipment ?? null);
    }

    if (!(PACKABLE_PAYMENT as readonly string[]).includes(order.paymentStatus)) {
      throw new PackingError(`Order ${order.number} has not been paid, so it cannot be packed.`, 409);
    }
    if (order.fulfilmentStatus !== "unfulfilled" && order.fulfilmentStatus !== "packing") {
      throw new PackingError(`Order ${order.number} has already left the packing bench.`, 409);
    }

    const [session] = await tx
      .insert(packingSessions)
      .values({
        merchantId,
        orderId: order.id,
        packerUserId: context.user.id,
        packerName: context.user.name,
        stationLabel: (stationLabel ?? "Station 1").slice(0, 40) || "Station 1",
      })
      .returning();

    await tx.update(orders).set({ fulfilmentStatus: "packing" }).where(eq(orders.id, order.id));

    const units = items.reduce((sum, item) => sum + item.quantity, 0);
    await appendLedgerEvent(
      {
        merchantId,
        orderId: order.id,
        type: "packing.started",
        actor: actor(context),
        source: "packing_station",
        sourceRef: session.id,
        summary: `${context.user.name} started packing at ${session.stationLabel}. ${units} unit${units === 1 ? "" : "s"} to verify.`,
        payload: {
          packingSessionId: session.id,
          station: session.stationLabel,
          packer: context.user.name,
          expected: items.map((item) => ({ sku: item.sku, barcode: item.barcode, name: item.name, quantity: item.quantity })),
        },
      },
      tx,
    );

    return buildState(tx, merchantId, session, { ...order, fulfilmentStatus: "packing" }, items, shipment ?? null);
  });
}

export async function getPackingState(context: SessionContext, sessionId: string): Promise<PackingState> {
  return db.transaction(async (tx) => {
    const { session, order, items, shipment } = await lockSession(tx, context.merchant.id, sessionId);
    return buildState(tx, context.merchant.id, session, order, items, shipment);
  });
}

// ---------------------------------------------------------------------------
// Scans
// ---------------------------------------------------------------------------

/**
 * Handle one scan during packing. The same entry point serves camera scans,
 * handheld scanners and typed codes. What the code means depends on what it
 * is: a product barcode, the shipping label, or the packing slip.
 */
export async function recordScan(
  context: SessionContext,
  sessionId: string,
  rawCode: string,
  method: ScanMethod,
): Promise<ScanOutcome> {
  const code = rawCode.trim();
  if (!code) throw new PackingError("No code was scanned.");
  if (code.length > 200) throw new PackingError("That code is too long to be a barcode.");
  const merchantId = context.merchant.id;

  return db.transaction(async (tx) => {
    const { session, order, items, shipment } = await lockSession(tx, merchantId, sessionId);
    requireInProgress(session);
    const step = computeStep(session, items);
    const finish = async (
      updated: PackingSession,
      outcome: Omit<ScanOutcome, "state">,
    ): Promise<ScanOutcome> => ({
      ...outcome,
      state: await buildState(tx, merchantId, updated, order, items, shipment),
    });

    // --- Packing slip ------------------------------------------------------
    const scannedOrderNumber = parseOrderBarcode(code);
    if (scannedOrderNumber) {
      const matches = scannedOrderNumber === order.number;
      await logScan(tx, session.id, { code, kind: "order", result: matches ? "ok" : "wrong_item", method });
      return finish(session, {
        ok: matches,
        result: matches ? "ok" : "wrong_order",
        title: matches ? "Right order" : "Different order",
        message: matches
          ? `This is the slip for ${order.number}. Now scan the items.`
          : `That slip is for ${scannedOrderNumber}. You are packing ${order.number}.`,
      });
    }

    // --- Shipping label ----------------------------------------------------
    const tracking = normaliseTrackingCode(code);
    const looksLikeTracking = /^[A-Z]{2,4}\d{6,}[A-Z]{0,3}$/.test(tracking);
    if (looksLikeTracking || (shipment && tracking === shipment.trackingNumber)) {
      if (step === "items") {
        await logScan(tx, session.id, { code, kind: "label", result: "wrong_label", method, note: "Scanned before items were verified" });
        return finish(session, {
          ok: false,
          result: "not_expected",
          title: "Items first",
          message: "Scan every item before the shipping label.",
        });
      }
      if (session.labelVerified) {
        return finish(session, {
          ok: true,
          result: "already_verified",
          title: "Label already checked",
          message: "This parcel's label has already been matched.",
        });
      }

      if (shipment && tracking === shipment.trackingNumber) {
        const [updated] = await tx
          .update(packingSessions)
          .set({ labelVerified: true })
          .where(eq(packingSessions.id, session.id))
          .returning();
        await logScan(tx, session.id, { code: tracking, kind: "label", result: "ok", method });
        await appendLedgerEvent(
          {
            merchantId,
            orderId: order.id,
            type: "packing.label_verified",
            actor: actor(context),
            source: "packing_station",
            sourceRef: tracking,
            summary: `Shipping label ${tracking} scanned and matched to order ${order.number}.`,
            payload: { packingSessionId: session.id, trackingNumber: tracking, method },
          },
          tx,
        );
        return finish(updated, {
          ok: true,
          result: "ok",
          title: "Label matches",
          message: `${tracking} belongs to ${order.number}.`,
        });
      }

      // A label for some other parcel.
      const [other] = await tx
        .select({ number: orders.number })
        .from(shipments)
        .innerJoin(orders, eq(orders.id, shipments.orderId))
        .where(and(eq(shipments.trackingNumber, tracking), eq(shipments.merchantId, merchantId)))
        .limit(1);
      const [updated] = await tx
        .update(packingSessions)
        .set({ exceptions: [...session.exceptions, exception("wrong_label", false, { code: tracking })] })
        .where(eq(packingSessions.id, session.id))
        .returning();
      await logScan(tx, session.id, { code: tracking, kind: "label", result: "wrong_label", method });
      await appendLedgerEvent(
        {
          merchantId,
          orderId: order.id,
          type: "packing.mismatch",
          actor: actor(context),
          source: "packing_station",
          sourceRef: tracking,
          summary:
            `Wrong shipping label scanned: ${tracking}` +
            (other ? ` belongs to order ${other.number}` : " is not this order's label") +
            `. The packer was warned before the parcel was sealed.`,
          payload: {
            packingSessionId: session.id,
            kind: "wrong_label",
            scanned: tracking,
            expected: shipment?.trackingNumber ?? null,
            belongsToOrder: other?.number ?? null,
          },
        },
        tx,
      );
      return finish(updated, {
        ok: false,
        result: "wrong_label",
        title: "Wrong label",
        message: other
          ? `That label is for ${other.number}, not ${order.number}.`
          : `That label does not belong to ${order.number}.`,
      });
    }

    // --- Product barcode ---------------------------------------------------
    const productCode = normaliseProductCode(code);
    const item = items.find((candidate) => candidate.barcode === productCode || candidate.sku === code.toUpperCase());

    if (item) {
      const verified = session.itemCounts[item.id] ?? 0;
      if (verified >= item.quantity) {
        const [updated] = await tx
          .update(packingSessions)
          .set({
            exceptions: [
              ...session.exceptions,
              exception("over_quantity", false, { code: productCode, orderItemId: item.id }),
            ],
          })
          .where(eq(packingSessions.id, session.id))
          .returning();
        await logScan(tx, session.id, { code: productCode, kind: "item", result: "over_quantity", method, orderItemId: item.id });
        await appendLedgerEvent(
          {
            merchantId,
            orderId: order.id,
            type: "packing.mismatch",
            actor: actor(context),
            source: "packing_station",
            sourceRef: productCode,
            summary:
              `Extra unit scanned: ${item.name} was scanned again after all ${item.quantity} ordered ` +
              `had been verified. The packer was warned.`,
            payload: {
              packingSessionId: session.id,
              kind: "over_quantity",
              sku: item.sku,
              barcode: item.barcode,
              ordered: item.quantity,
            },
          },
          tx,
        );
        return finish(updated, {
          ok: false,
          result: "over_quantity",
          title: "Too many",
          message: `Only ${item.quantity} × ${item.name} ordered, and ${item.quantity === 1 ? "it is" : "they are"} already scanned.`,
          itemId: item.id,
        });
      }

      const nextCount = verified + 1;
      const [updated] = await tx
        .update(packingSessions)
        .set({ itemCounts: { ...session.itemCounts, [item.id]: nextCount } })
        .where(eq(packingSessions.id, session.id))
        .returning();
      await logScan(tx, session.id, { code: productCode, kind: "item", result: "ok", method, orderItemId: item.id });
      await appendLedgerEvent(
        {
          merchantId,
          orderId: order.id,
          type: "packing.item_verified",
          actor: actor(context),
          source: "packing_station",
          sourceRef: productCode,
          summary: `${item.name} scanned and matched to the order (${nextCount} of ${item.quantity}).`,
          payload: {
            packingSessionId: session.id,
            sku: item.sku,
            barcode: item.barcode,
            name: item.name,
            verified: nextCount,
            ordered: item.quantity,
            method,
          },
        },
        tx,
      );
      return finish(updated, {
        ok: true,
        result: "ok",
        title: nextCount >= item.quantity ? "Matched" : `Matched ${nextCount} of ${item.quantity}`,
        message: item.name,
        itemId: item.id,
      });
    }

    // Not in this order. Name the product if the catalogue knows it.
    const [known] = await tx
      .select({ sku: products.sku, name: products.name })
      .from(products)
      .where(and(eq(products.merchantId, merchantId), eq(products.barcode, productCode)))
      .limit(1);
    const result: ScanResult = known ? "wrong_item" : "unknown_code";
    const [updated] = await tx
      .update(packingSessions)
      .set({ exceptions: [...session.exceptions, exception(result, false, { code: productCode })] })
      .where(eq(packingSessions.id, session.id))
      .returning();
    await logScan(tx, session.id, { code: productCode, kind: "item", result, method });
    await appendLedgerEvent(
      {
        merchantId,
        orderId: order.id,
        type: "packing.mismatch",
        actor: actor(context),
        source: "packing_station",
        sourceRef: productCode,
        summary: known
          ? `Wrong item scanned: ${known.name} is not in this order. The packer was warned.`
          : `Unrecognised barcode ${productCode} scanned. The packer was warned.`,
        payload: {
          packingSessionId: session.id,
          kind: result,
          scanned: productCode,
          scannedProduct: known ?? null,
        },
      },
      tx,
    );
    return finish(updated, {
      ok: false,
      result,
      title: known ? "Wrong item" : "Unknown barcode",
      message: known
        ? `${known.name} is not in order ${order.number}.`
        : `${productCode} is not a product in this order.`,
    });
  });
}

// ---------------------------------------------------------------------------
// Overrides
// ---------------------------------------------------------------------------

export type OverrideInput =
  | { kind: "manual_item"; orderItemId: string; reason: string }
  | { kind: "short_pack"; reason: string }
  | { kind: "skip_step"; step: "contents_photo" | "label" | "label_photo"; reason: string };

/**
 * Continue past a check on a person's say-so. Every override needs a reason
 * and is recorded with the name of whoever made it.
 */
export async function recordOverride(
  context: SessionContext,
  sessionId: string,
  input: OverrideInput,
): Promise<PackingState> {
  const reason = input.reason?.trim();
  if (!reason || reason.length < 3) throw new PackingError("Give a short reason for the override.");
  if (reason.length > 300) throw new PackingError("Keep the reason under 300 characters.");
  const merchantId = context.merchant.id;

  return db.transaction(async (tx) => {
    const { session, order, items, shipment } = await lockSession(tx, merchantId, sessionId);
    requireInProgress(session);

    let itemCounts = session.itemCounts;
    let added: PackingException;
    let summary: string;
    const payload: Record<string, unknown> = { packingSessionId: session.id, reason, by: context.user.name };

    if (input.kind === "manual_item") {
      const item = items.find((candidate) => candidate.id === input.orderItemId);
      if (!item) throw new PackingError("That item is not part of this order.");
      const verified = itemCounts[item.id] ?? 0;
      if (verified >= item.quantity) throw new PackingError("That item is already fully verified.");
      itemCounts = { ...itemCounts, [item.id]: verified + 1 };
      added = exception("manual_entry", true, { orderItemId: item.id, code: item.barcode, note: reason });
      summary =
        `${context.user.name} confirmed ${item.name} by hand, without a scan ` +
        `(${verified + 1} of ${item.quantity}). Reason: ${reason}`;
      Object.assign(payload, { kind: "manual_entry", sku: item.sku, barcode: item.barcode, verified: verified + 1, ordered: item.quantity });
      await logScan(tx, session.id, {
        code: item.barcode,
        kind: "item",
        result: "override",
        method: "manual",
        orderItemId: item.id,
        note: reason,
      });
    } else if (input.kind === "short_pack") {
      const short = items
        .filter((item) => (itemCounts[item.id] ?? 0) < item.quantity)
        .map((item) => ({ sku: item.sku, name: item.name, ordered: item.quantity, verified: itemCounts[item.id] ?? 0 }));
      if (short.length === 0) throw new PackingError("Every item is already verified.");
      added = exception("short_pack", true, { note: reason });
      summary =
        `${context.user.name} chose to send this parcel short: ` +
        short.map((line) => `${line.verified} of ${line.ordered} ${line.name}`).join("; ") +
        `. Reason: ${reason}`;
      Object.assign(payload, { kind: "short_pack", short });
    } else {
      const kind = SKIPPABLE[input.step];
      if (!kind) throw new PackingError("That step cannot be skipped.");
      added = exception(kind, true, { code: input.step, note: reason });
      const what =
        input.step === "label"
          ? "the shipping label scan"
          : input.step === "contents_photo"
            ? "the photo of the parcel contents"
            : "the photo of the labelled parcel";
      summary = `${context.user.name} skipped ${what}. Reason: ${reason}`;
      Object.assign(payload, { kind, step: input.step });
    }

    const [updated] = await tx
      .update(packingSessions)
      .set({ itemCounts, exceptions: [...session.exceptions, added] })
      .where(eq(packingSessions.id, session.id))
      .returning();

    await appendLedgerEvent(
      {
        merchantId,
        orderId: order.id,
        type: "packing.override",
        actor: actor(context),
        source: "packing_station",
        sourceRef: session.id,
        summary,
        payload,
      },
      tx,
    );

    return buildState(tx, merchantId, updated, order, items, shipment);
  });
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

const PHOTO_MIMES = new Set(["image/jpeg", "image/png"]);

export type PhotoInput = {
  kind: "contents" | "label";
  bytes: Buffer;
  mime: string;
  width?: number | null;
  height?: number | null;
  capturedAt?: Date | null;
};

/** Store a packing photo. The file and its ledger entry commit together. */
export async function attachPackingPhoto(
  context: SessionContext,
  sessionId: string,
  input: PhotoInput,
): Promise<PackingState> {
  if (!PHOTO_MIMES.has(input.mime)) throw new PackingError("Photos must be JPEG or PNG images.");
  if (input.bytes.length < 500) throw new PackingError("That photo appears to be empty.");
  const merchantId = context.merchant.id;

  return db.transaction(async (tx) => {
    const { session, order, items, shipment } = await lockSession(tx, merchantId, sessionId);
    requireInProgress(session);
    const step = computeStep(session, items);
    if (input.kind === "contents" && step === "items") {
      throw new PackingError("Scan every item before photographing the parcel.");
    }
    if (input.kind === "label" && (step === "items" || step === "contents_photo" || step === "label")) {
      throw new PackingError("Scan the shipping label before photographing the sealed parcel.");
    }

    const file = await saveEvidenceFile(
      {
        merchantId,
        orderId: order.id,
        kind: input.kind === "contents" ? "packing_contents_photo" : "packing_label_photo",
        mime: input.mime,
        bytes: input.bytes,
        width: input.width ?? null,
        height: input.height ?? null,
        capturedAt: input.capturedAt ?? null,
        createdByUserId: context.user.id,
      },
      tx,
    );

    const [updated] = await tx
      .update(packingSessions)
      .set(input.kind === "contents" ? { contentsPhotoFileId: file.id } : { labelPhotoFileId: file.id })
      .where(eq(packingSessions.id, session.id))
      .returning();

    const retake = input.kind === "contents" ? Boolean(session.contentsPhotoFileId) : Boolean(session.labelPhotoFileId);
    await appendLedgerEvent(
      {
        merchantId,
        orderId: order.id,
        type: input.kind === "contents" ? "packing.contents_photo" : "packing.label_photo",
        actor: actor(context),
        source: "packing_station",
        sourceRef: file.id,
        summary:
          (input.kind === "contents"
            ? "Photograph of the open parcel taken before sealing"
            : "Photograph of the sealed, labelled parcel taken") + (retake ? " (retake)." : "."),
        payload: {
          packingSessionId: session.id,
          fileId: file.id,
          sha256: file.sha256,
          sizeBytes: file.sizeBytes,
          width: file.width,
          height: file.height,
          deviceCapturedAt: input.capturedAt?.toISOString() ?? null,
          retake,
        },
        attachments: [toAttachment(file)],
      },
      tx,
    );

    return buildState(tx, merchantId, updated, order, items, shipment);
  });
}

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

/** Finish packing. The order becomes "packed", which is not the same as handed to the carrier. */
export async function completePacking(context: SessionContext, sessionId: string): Promise<PackingState> {
  const merchantId = context.merchant.id;

  return db.transaction(async (tx) => {
    const { session, order, items, shipment } = await lockSession(tx, merchantId, sessionId);
    if (session.status !== "in_progress") {
      return buildState(tx, merchantId, session, order, items, shipment);
    }

    const step = computeStep(session, items);
    if (step !== "review") {
      const missing: Record<PackingStep, string> = {
        items: "Some items have not been scanned.",
        contents_photo: "The photo of the open parcel is missing.",
        label: "The shipping label has not been scanned.",
        label_photo: "The photo of the labelled parcel is missing.",
        review: "",
        done: "",
      };
      throw new PackingError(missing[step] || "Packing is not ready to complete.", 409);
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - session.startedAt.getTime();
    const overrides = session.exceptions.filter((entry) => entry.overridden);
    const warnings = session.exceptions.filter((entry) => !entry.overridden);
    const status: PackingSessionStatus = overrides.length > 0 ? "completed_with_exceptions" : "completed";

    const [updated] = await tx
      .update(packingSessions)
      .set({ status, completedAt, durationMs })
      .where(eq(packingSessions.id, session.id))
      .returning();
    await tx
      .update(orders)
      .set({ fulfilmentStatus: "packed", packedAt: completedAt })
      .where(eq(orders.id, order.id));

    const ordered = items.reduce((sum, item) => sum + item.quantity, 0);
    const verified = items.reduce((sum, item) => sum + Math.min(session.itemCounts[item.id] ?? 0, item.quantity), 0);
    const photos = [session.contentsPhotoFileId, session.labelPhotoFileId].filter(Boolean).length;

    await appendLedgerEvent(
      {
        merchantId,
        orderId: order.id,
        type: "packing.completed",
        occurredAt: completedAt,
        actor: actor(context),
        source: "packing_station",
        sourceRef: session.id,
        summary:
          `Packing completed by ${session.packerName ?? context.user.name} at ${session.stationLabel} in ` +
          `${formatDuration(durationMs)}: ${verified} of ${ordered} unit${ordered === 1 ? "" : "s"} verified, ` +
          `shipping label ${session.labelVerified ? "matched" : "not scanned"}, ` +
          `${photos} photograph${photos === 1 ? "" : "s"} stored` +
          (overrides.length > 0 ? `, ${overrides.length} override${overrides.length === 1 ? "" : "s"} recorded.` : ".") +
          (warnings.length > 0
            ? ` ${warnings.length} mismatch warning${warnings.length === 1 ? " was" : "s were"} raised and corrected.`
            : ""),
        payload: {
          packingSessionId: session.id,
          packer: session.packerName,
          station: session.stationLabel,
          startedAt: session.startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          durationMs,
          items: items.map((item) => ({
            sku: item.sku,
            barcode: item.barcode,
            name: item.name,
            ordered: item.quantity,
            verified: session.itemCounts[item.id] ?? 0,
          })),
          labelVerified: session.labelVerified,
          trackingNumber: shipment?.trackingNumber ?? null,
          contentsPhotoFileId: session.contentsPhotoFileId,
          labelPhotoFileId: session.labelPhotoFileId,
          overrides,
          warningsCorrected: warnings.length,
        },
      },
      tx,
    );

    return buildState(tx, merchantId, updated, { ...order, fulfilmentStatus: "packed" }, items, shipment);
  });
}
