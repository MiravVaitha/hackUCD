import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb, db } from "@/db/client";
import { ledgerEvents, orders, products, users } from "@/db/schema";
import type { SessionContext } from "@/lib/auth/session";
import { recordHandover, simulateCarrierEvent } from "@/lib/carriers/demo-carrier";
import { DEMO_USERS } from "@/lib/catalog";
import { verifyOrderLedger } from "@/lib/ledger/verify";
import {
  attachPackingPhoto,
  completePacking,
  recordOverride,
  recordScan,
  startPackingSession,
} from "@/lib/packing/service";
import {
  cleanupTestOrders,
  createPackableOrder,
  createTestOrder,
  getDemoMerchant,
  trackingNumberFor,
} from "./helpers";

let context: SessionContext;
let earbudsBarcode = "";
let cable2mBarcode = "";
let cable1mBarcode = "";

/** A tiny but valid-looking JPEG payload. Only its bytes and hash matter here. */
function fakeJpeg(label: string): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(600, label), Buffer.from([0xff, 0xd9])]);
}

const makePackableOrder = createPackableOrder;
const trackingFor = trackingNumberFor;

async function eventTypes(orderId: string): Promise<string[]> {
  const events = await db
    .select({ type: ledgerEvents.type })
    .from(ledgerEvents)
    .where(eq(ledgerEvents.orderId, orderId))
    .orderBy(asc(ledgerEvents.seq));
  return events.map((event) => event.type);
}

beforeAll(async () => {
  const merchant = await getDemoMerchant();
  const packerEmail = DEMO_USERS.find((user) => user.role === "packer")!.email;
  const [packer] = await db.select().from(users).where(eq(users.email, packerEmail));
  context = {
    sessionId: "test-session",
    user: { id: packer.id, email: packer.email, name: packer.name, role: packer.role },
    merchant,
  };
  const catalogue = await db.select().from(products).where(eq(products.merchantId, merchant.id));
  earbudsBarcode = catalogue.find((product) => product.sku === "VB-EARBUDS-PRO")!.barcode;
  cable2mBarcode = catalogue.find((product) => product.sku === "VB-CABLE-USBC-2M")!.barcode;
  cable1mBarcode = catalogue.find((product) => product.sku === "VB-CABLE-USBC-1M")!.barcode;
});

afterAll(async () => {
  await cleanupTestOrders();
  await closeDb();
});

describe("packing station", () => {
  it("walks a clean order from scans to packed, in the required order", async () => {
    const order = await makePackableOrder([
      { sku: "VB-EARBUDS-PRO", quantity: 1 },
      { sku: "VB-CABLE-USBC-2M", quantity: 2 },
    ]);
    const tracking = await trackingFor(order.id);

    let state = await startPackingSession(context, order.number, "Station 7");
    expect(state.step).toBe("items");
    expect(state.stationLabel).toBe("Station 7");

    // The label cannot be scanned and photos cannot be taken before the items.
    const early = await recordScan(context, state.sessionId, tracking, "camera");
    expect(early.ok).toBe(false);
    expect(early.result).toBe("not_expected");
    await expect(
      attachPackingPhoto(context, state.sessionId, { kind: "contents", bytes: fakeJpeg("a"), mime: "image/jpeg" }),
    ).rejects.toThrow(/Scan every item/);

    expect((await recordScan(context, state.sessionId, earbudsBarcode, "camera")).ok).toBe(true);
    const first = await recordScan(context, state.sessionId, cable2mBarcode, "camera");
    expect(first.title).toBe("Matched 1 of 2");
    expect(first.state.step).toBe("items");
    const second = await recordScan(context, state.sessionId, cable2mBarcode, "scanner");
    expect(second.state.step).toBe("contents_photo");

    state = await attachPackingPhoto(context, state.sessionId, {
      kind: "contents",
      bytes: fakeJpeg("contents"),
      mime: "image/jpeg",
      width: 1600,
      height: 1200,
    });
    expect(state.step).toBe("label");
    expect(state.contentsPhoto?.sha256).toHaveLength(64);

    const label = await recordScan(context, state.sessionId, tracking.toLowerCase(), "camera");
    expect(label.ok).toBe(true);
    expect(label.state.step).toBe("label_photo");

    state = await attachPackingPhoto(context, state.sessionId, {
      kind: "label",
      bytes: fakeJpeg("label"),
      mime: "image/jpeg",
    });
    expect(state.step).toBe("review");

    state = await completePacking(context, state.sessionId);
    expect(state.status).toBe("completed");
    expect(state.step).toBe("done");

    const [after] = await db.select().from(orders).where(eq(orders.id, order.id));
    // Packed is not the same as handed to the carrier.
    expect(after.fulfilmentStatus).toBe("packed");
    expect(after.handedToCarrierAt).toBeNull();

    expect(await eventTypes(order.id)).toEqual([
      "packing.started",
      "packing.item_verified",
      "packing.item_verified",
      "packing.item_verified",
      "packing.contents_photo",
      "packing.label_verified",
      "packing.label_photo",
      "packing.completed",
    ]);
    const report = await verifyOrderLedger(order.id, order.merchantId);
    expect(report).toMatchObject({ ok: true, fileCount: 2 });
  });

  it("warns on a wrong item, an extra unit and an unknown code without counting them", async () => {
    const order = await makePackableOrder([{ sku: "VB-CABLE-USBC-2M", quantity: 1 }]);
    const state = await startPackingSession(context, order.number);

    const wrong = await recordScan(context, state.sessionId, cable1mBarcode, "camera");
    expect(wrong).toMatchObject({ ok: false, result: "wrong_item", title: "Wrong item" });
    expect(wrong.message).toContain("USB-C Cable 1 m");
    expect(wrong.state.items[0].verified).toBe(0);

    const unknown = await recordScan(context, state.sessionId, "5012345678900", "camera");
    expect(unknown).toMatchObject({ ok: false, result: "unknown_code" });

    expect((await recordScan(context, state.sessionId, cable2mBarcode, "camera")).ok).toBe(true);
    const extra = await recordScan(context, state.sessionId, cable2mBarcode, "camera");
    expect(extra).toMatchObject({ ok: false, result: "over_quantity" });
    expect(extra.state.items[0].verified).toBe(1);

    // Warnings are recorded as corrected mismatches, not as overrides.
    expect(extra.state.exceptions.map((entry) => [entry.kind, entry.overridden])).toEqual([
      ["wrong_item", false],
      ["unknown_code", false],
      ["over_quantity", false],
    ]);
    expect((await eventTypes(order.id)).filter((type) => type === "packing.mismatch")).toHaveLength(3);
  });

  it("catches another order's shipping label", async () => {
    const order = await makePackableOrder([{ sku: "VB-CABLE-USBC-2M", quantity: 1 }]);
    const other = await makePackableOrder([{ sku: "VB-CABLE-USBC-2M", quantity: 1 }]);
    const otherTracking = await trackingFor(other.id);

    let state = await startPackingSession(context, order.number);
    await recordScan(context, state.sessionId, cable2mBarcode, "camera");
    state = await attachPackingPhoto(context, state.sessionId, {
      kind: "contents",
      bytes: fakeJpeg("c"),
      mime: "image/jpeg",
    });

    const wrongLabel = await recordScan(context, state.sessionId, otherTracking, "camera");
    expect(wrongLabel).toMatchObject({ ok: false, result: "wrong_label" });
    expect(wrongLabel.message).toContain(other.number);
    expect(wrongLabel.state.labelVerified).toBe(false);
  });

  it("recognises a different order's packing slip", async () => {
    const order = await makePackableOrder([{ sku: "VB-CABLE-USBC-2M", quantity: 1 }]);
    const state = await startPackingSession(context, order.number);
    const slip = await recordScan(context, state.sessionId, "PS-ORDER:VB-999999", "camera");
    expect(slip).toMatchObject({ ok: false, result: "wrong_order" });
  });

  it("records a short pack only with a reason, and marks the session as an exception", async () => {
    const order = await makePackableOrder([{ sku: "VB-EARBUDS-PRO", quantity: 2 }]);
    let state = await startPackingSession(context, order.number);
    await recordScan(context, state.sessionId, earbudsBarcode, "camera");

    await expect(completePacking(context, state.sessionId)).rejects.toThrow(/not been scanned/);
    await expect(recordOverride(context, state.sessionId, { kind: "short_pack", reason: " " })).rejects.toThrow(
      /reason/,
    );

    state = await recordOverride(context, state.sessionId, {
      kind: "short_pack",
      reason: "Only one in stock; customer to be told",
    });
    expect(state.step).toBe("contents_photo");

    state = await recordOverride(context, state.sessionId, {
      kind: "skip_step",
      step: "contents_photo",
      reason: "Camera unavailable",
    });
    state = await recordOverride(context, state.sessionId, { kind: "skip_step", step: "label", reason: "Label smudged" });
    state = await recordOverride(context, state.sessionId, {
      kind: "skip_step",
      step: "label_photo",
      reason: "Camera unavailable",
    });
    expect(state.step).toBe("review");

    state = await completePacking(context, state.sessionId);
    expect(state.status).toBe("completed_with_exceptions");

    const events = await db
      .select()
      .from(ledgerEvents)
      .where(eq(ledgerEvents.orderId, order.id))
      .orderBy(asc(ledgerEvents.seq));
    const shortPack = events.find(
      (event) => event.type === "packing.override" && event.summary.includes("send this parcel short"),
    );
    expect(shortPack?.summary).toContain("1 of 2 Pulse Pro Wireless Earbuds");
    expect(shortPack?.summary).toContain("Only one in stock");
    expect(events.at(-1)?.summary).toContain("1 of 2 units verified");
  });

  it("resumes the open session instead of starting a second one", async () => {
    const order = await makePackableOrder([{ sku: "VB-CABLE-USBC-2M", quantity: 1 }]);
    const first = await startPackingSession(context, order.number);
    await recordScan(context, first.sessionId, cable2mBarcode, "camera");
    const again = await startPackingSession(context, order.number);
    expect(again.sessionId).toBe(first.sessionId);
    expect(again.items[0].verified).toBe(1);
    expect((await eventTypes(order.id)).filter((type) => type === "packing.started")).toHaveLength(1);
  });

  it("refuses to pack an unpaid order", async () => {
    const order = await createTestOrder({ paymentStatus: "pending" });
    await expect(startPackingSession(context, order.number)).rejects.toThrow(/not been paid/);
  });
});

describe("demo courier", () => {
  it("keeps handover, transit and delivery as separate recorded facts", async () => {
    const order = await makePackableOrder([{ sku: "VB-CABLE-USBC-2M", quantity: 1 }]);
    const tracking = await trackingFor(order.id);

    // Cannot be handed over before it is packed.
    await expect(recordHandover(context, order.id)).rejects.toThrow(/Pack the order/);

    let state = await startPackingSession(context, order.number);
    await recordScan(context, state.sessionId, cable2mBarcode, "camera");
    state = await attachPackingPhoto(context, state.sessionId, { kind: "contents", bytes: fakeJpeg("c"), mime: "image/jpeg" });
    await recordScan(context, state.sessionId, tracking, "camera");
    state = await attachPackingPhoto(context, state.sessionId, { kind: "label", bytes: fakeJpeg("l"), mime: "image/jpeg" });
    await completePacking(context, state.sessionId);

    // The courier cannot report anything before the parcel is handed over.
    await expect(simulateCarrierEvent(context, order.id, "delivered")).rejects.toThrow(/Hand the parcel/);

    await recordHandover(context, order.id);
    await simulateCarrierEvent(context, order.id, "in_transit");
    await simulateCarrierEvent(context, order.id, "delivered", { method: "signature", signedBy: "T. Customer" });
    await expect(simulateCarrierEvent(context, order.id, "in_transit")).rejects.toThrow(/already been delivered/);

    const [after] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(after.fulfilmentStatus).toBe("delivered");
    expect(after.packedAt).not.toBeNull();
    expect(after.handedToCarrierAt).not.toBeNull();
    expect(after.deliveredAt).not.toBeNull();

    const events = await db
      .select()
      .from(ledgerEvents)
      .where(eq(ledgerEvents.orderId, order.id))
      .orderBy(asc(ledgerEvents.seq));
    const shipping = events.filter((event) => event.type.startsWith("shipment."));
    expect(shipping.map((event) => [event.type, event.simulated])).toEqual([
      // The handover is the merchant's own record; courier scans are simulated.
      ["shipment.handed_to_carrier", false],
      ["shipment.in_transit", true],
      ["shipment.delivered", true],
    ]);
    expect(shipping.at(-1)?.summary).toContain("signed for by T. Customer");
  });
});
