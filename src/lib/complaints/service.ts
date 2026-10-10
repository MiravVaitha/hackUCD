import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";

import { db, type Tx } from "@/db/client";
import {
  complaintMessages,
  complaints,
  merchants,
  orders,
  type Complaint,
  type ComplaintChannel,
  type ComplaintMessage,
  type ComplaintResolution,
  type Order,
} from "@/db/schema";
import type { SessionContext } from "@/lib/auth/session";
import { appendLedgerEvent } from "@/lib/ledger/append";
import { sentenceCase } from "@/lib/utils";

export class ComplaintError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "ComplaintError";
  }
}

const MAX_BODY = 5000;
const MAX_SUBJECT = 160;

function clean(value: string | null | undefined, max: number): string {
  return (value ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

async function allocateComplaintNumber(tx: Tx, merchantId: string): Promise<string> {
  const [row] = await tx
    .update(merchants)
    .set({ complaintCounter: sql`${merchants.complaintCounter} + 1` })
    .where(eq(merchants.id, merchantId))
    .returning({ counter: merchants.complaintCounter });
  return `C-${String(row.counter).padStart(4, "0")}`;
}

function channelLabel(channel: ComplaintChannel): string {
  return channel === "web_form" ? "the help form" : channel === "email_paste" ? "a forwarded email" : "the support team";
}

async function recordReceived(tx: Tx, complaint: Complaint, order: Pick<Order, "id" | "merchantId">, linkedLater: boolean) {
  await appendLedgerEvent(
    {
      merchantId: order.merchantId,
      orderId: order.id,
      type: "complaint.received",
      occurredAt: complaint.createdAt,
      actor: { type: "customer", label: complaint.customerName ?? "Customer" },
      source: complaint.channel === "web_form" ? "web_form" : "merchant_app",
      sourceRef: complaint.number,
      summary:
        `Complaint ${complaint.number} received through ${channelLabel(complaint.channel)}: ` +
        `"${complaint.subject}".` +
        (linkedLater ? " Linked to this order by the support team." : ""),
      payload: {
        complaintNumber: complaint.number,
        channel: complaint.channel,
        subject: complaint.subject,
        message: complaint.body,
        customerName: complaint.customerName,
        customerEmail: complaint.customerEmail,
        linkedLater,
      },
      simulated: complaint.simulated,
      dedupeKey: `complaint.received:${complaint.id}`,
    },
    tx,
  );
}

export type NewComplaint = {
  merchantId: string;
  orderId: string | null;
  channel: ComplaintChannel;
  customerEmail?: string | null;
  customerName?: string | null;
  subject?: string | null;
  body: string;
  createdByUserId?: string | null;
  simulated?: boolean;
  receivedAt?: Date;
};

/** A short subject taken from the start of the customer's message. */
export function subjectFromBody(body: string): string {
  const firstLine = body.split("\n").find((line) => line.trim().length > 0) ?? "Customer complaint";
  const sentence = firstLine.trim().split(/(?<=[.!?])\s/)[0];
  return sentence.length > 80 ? sentence.slice(0, 77).trimEnd() + "…" : sentence;
}

/** Record a complaint. If it is tied to an order, it also goes on that order's ledger. */
export async function createComplaint(input: NewComplaint): Promise<Complaint> {
  const body = clean(input.body, MAX_BODY);
  if (body.length < 5) throw new ComplaintError("Describe the problem in a sentence or two.");
  const subject = clean(input.subject, MAX_SUBJECT) || subjectFromBody(body);
  const receivedAt = input.receivedAt ?? new Date();

  return db.transaction(async (tx) => {
    let order: Order | null = null;
    if (input.orderId) {
      const [found] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.id, input.orderId), eq(orders.merchantId, input.merchantId)))
        .limit(1);
      if (!found) throw new ComplaintError("That order could not be found.", 404);
      order = found;
    }

    const number = await allocateComplaintNumber(tx, input.merchantId);
    const [complaint] = await tx
      .insert(complaints)
      .values({
        merchantId: input.merchantId,
        orderId: order?.id ?? null,
        number,
        channel: input.channel,
        customerEmail: clean(input.customerEmail, 200).toLowerCase() || order?.customerEmail || null,
        customerName: clean(input.customerName, 120) || order?.customerName || null,
        subject,
        body,
        publicToken: randomBytes(24).toString("base64url"),
        simulated: input.simulated ?? false,
        createdByUserId: input.createdByUserId ?? null,
        createdAt: receivedAt,
        updatedAt: receivedAt,
      })
      .returning();

    await tx.insert(complaintMessages).values({
      complaintId: complaint.id,
      direction: "inbound",
      authorLabel: complaint.customerName ?? "Customer",
      body,
      createdAt: receivedAt,
    });

    if (order) await recordReceived(tx, complaint, order, false);
    return complaint;
  });
}

/**
 * A complaint from the public help form. It is linked to the order only when
 * the email matches the one on the order, so an order number alone reveals
 * nothing. Otherwise it is kept unlinked for the support team to match.
 */
export async function createComplaintFromHelpForm(input: {
  merchantId: string;
  orderNumber: string;
  email: string;
  name: string;
  message: string;
}): Promise<Complaint> {
  const email = clean(input.email, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ComplaintError("Enter a valid email address.");
  const message = clean(input.message, MAX_BODY);
  if (message.length < 10) throw new ComplaintError("Tell us a little more about what went wrong.");

  // A simple brake on a public form.
  const [recent] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(complaints)
    .where(
      and(
        eq(complaints.merchantId, input.merchantId),
        eq(complaints.customerEmail, email),
        gt(complaints.createdAt, new Date(Date.now() - 60 * 60 * 1000)),
      ),
    );
  if ((recent?.count ?? 0) >= 5) {
    throw new ComplaintError("You have sent several messages already. We will reply to those first.", 429);
  }

  const orderNumber = clean(input.orderNumber, 40).toUpperCase();
  const [order] = orderNumber
    ? await db
        .select()
        .from(orders)
        .where(and(eq(orders.merchantId, input.merchantId), eq(orders.number, orderNumber)))
        .limit(1)
    : [];
  const matches = Boolean(order && order.customerEmail && order.customerEmail.toLowerCase() === email);

  return createComplaint({
    merchantId: input.merchantId,
    orderId: matches && order ? order.id : null,
    channel: "web_form",
    customerEmail: email,
    customerName: clean(input.name, 120) || null,
    subject: orderNumber && !matches ? `${subjectFromBody(message)} (quoted order ${orderNumber})` : null,
    body: message,
  });
}

export type ComplaintThread = {
  complaint: Complaint;
  messages: ComplaintMessage[];
  order: Order | null;
};

export async function getComplaintThread(merchantId: string, number: string): Promise<ComplaintThread | null> {
  const [complaint] = await db
    .select()
    .from(complaints)
    .where(and(eq(complaints.merchantId, merchantId), eq(complaints.number, number.toUpperCase())))
    .limit(1);
  if (!complaint) return null;
  return loadThread(complaint);
}

export async function getComplaintThreadById(merchantId: string, id: string): Promise<ComplaintThread | null> {
  const [complaint] = await db
    .select()
    .from(complaints)
    .where(and(eq(complaints.merchantId, merchantId), eq(complaints.id, id)))
    .limit(1);
  if (!complaint) return null;
  return loadThread(complaint);
}

/** The customer's own view, reached by the unguessable link they were given. */
export async function getComplaintThreadByToken(token: string): Promise<ComplaintThread | null> {
  if (!/^[A-Za-z0-9_-]{20,60}$/.test(token)) return null;
  const [complaint] = await db.select().from(complaints).where(eq(complaints.publicToken, token)).limit(1);
  if (!complaint) return null;
  return loadThread(complaint);
}

async function loadThread(complaint: Complaint): Promise<ComplaintThread> {
  const [messages, orderRows] = await Promise.all([
    db
      .select()
      .from(complaintMessages)
      .where(eq(complaintMessages.complaintId, complaint.id))
      .orderBy(asc(complaintMessages.createdAt)),
    complaint.orderId ? db.select().from(orders).where(eq(orders.id, complaint.orderId)).limit(1) : Promise.resolve([]),
  ]);
  return { complaint, messages, order: orderRows[0] ?? null };
}

export type ComplaintListRow = Complaint & { orderNumber: string | null; messageCount: number };

export async function listComplaints(merchantId: string, view: "open" | "all" = "all"): Promise<ComplaintListRow[]> {
  const conditions = [eq(complaints.merchantId, merchantId)];
  if (view === "open") {
    conditions.push(inArray(complaints.status, ["new", "investigating", "awaiting_customer"]));
  }
  const rows = await db
    .select({
      complaint: complaints,
      orderNumber: orders.number,
      messageCount: sql<number>`(select count(*)::int from ${complaintMessages} where ${complaintMessages.complaintId} = ${complaints.id})`,
    })
    .from(complaints)
    .leftJoin(orders, eq(orders.id, complaints.orderId))
    .where(and(...conditions))
    .orderBy(desc(complaints.createdAt))
    .limit(200);
  return rows.map((row) => ({ ...row.complaint, orderNumber: row.orderNumber, messageCount: row.messageCount }));
}

async function lockComplaint(tx: Tx, merchantId: string, complaintId: string): Promise<Complaint> {
  const [complaint] = await tx
    .select()
    .from(complaints)
    .where(and(eq(complaints.id, complaintId), eq(complaints.merchantId, merchantId)))
    .for("update");
  if (!complaint) throw new ComplaintError("That complaint could not be found.", 404);
  return complaint;
}

/** Tie an unlinked complaint to an order. The ledger entry keeps the time it was first received. */
export async function linkComplaintToOrder(
  context: SessionContext,
  complaintId: string,
  orderNumber: string,
): Promise<Complaint> {
  const merchantId = context.merchant.id;
  return db.transaction(async (tx) => {
    const complaint = await lockComplaint(tx, merchantId, complaintId);
    if (complaint.orderId) throw new ComplaintError("This complaint is already linked to an order.", 409);

    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.merchantId, merchantId), eq(orders.number, orderNumber.trim().toUpperCase())))
      .limit(1);
    if (!order) throw new ComplaintError(`Order ${orderNumber.trim()} could not be found.`, 404);

    const [updated] = await tx
      .update(complaints)
      .set({ orderId: order.id, updatedAt: new Date() })
      .where(eq(complaints.id, complaint.id))
      .returning();
    await recordReceived(tx, updated, order, true);
    return updated;
  });
}

/** Record the merchant's reply. Replies that began as an AI draft say so on the record. */
export async function sendReply(
  context: SessionContext,
  complaintId: string,
  input: { body: string; aiRunId?: string | null; aiDraft?: string | null },
): Promise<ComplaintMessage> {
  const body = clean(input.body, MAX_BODY);
  if (body.length < 2) throw new ComplaintError("Write a reply before sending.");
  const merchantId = context.merchant.id;

  return db.transaction(async (tx) => {
    const complaint = await lockComplaint(tx, merchantId, complaintId);
    const [message] = await tx
      .insert(complaintMessages)
      .values({
        complaintId: complaint.id,
        direction: "outbound",
        authorLabel: context.user.name,
        body,
        aiRunId: input.aiRunId ?? null,
        createdByUserId: context.user.id,
      })
      .returning();

    await tx
      .update(complaints)
      .set({
        status: complaint.status === "resolved" || complaint.status === "escalated" ? complaint.status : "awaiting_customer",
        updatedAt: new Date(),
      })
      .where(eq(complaints.id, complaint.id));

    if (complaint.orderId) {
      const draftedByAi = Boolean(input.aiRunId);
      const edited = draftedByAi && input.aiDraft !== undefined && input.aiDraft !== null && clean(input.aiDraft, MAX_BODY) !== body;
      await appendLedgerEvent(
        {
          merchantId,
          orderId: complaint.orderId,
          type: "complaint.reply_sent",
          actor: { type: "user", id: context.user.id, label: context.user.name },
          source: "merchant_app",
          sourceRef: complaint.number,
          summary:
            `${context.user.name} replied to the customer about complaint ${complaint.number}` +
            (draftedByAi ? (edited ? " (AI draft, edited before sending)." : " (AI draft, sent as written after review).") : "."),
          payload: {
            complaintNumber: complaint.number,
            message: body,
            draftedByAi,
            editedBeforeSending: edited,
            aiRunId: input.aiRunId ?? null,
          },
        },
        tx,
      );
    }
    return message;
  });
}

export async function addInternalNote(context: SessionContext, complaintId: string, text: string): Promise<void> {
  const body = clean(text, MAX_BODY);
  if (body.length < 2) throw new ComplaintError("Write a note first.");
  await db.transaction(async (tx) => {
    const complaint = await lockComplaint(tx, context.merchant.id, complaintId);
    await tx.insert(complaintMessages).values({
      complaintId: complaint.id,
      direction: "internal",
      authorLabel: context.user.name,
      body,
      createdByUserId: context.user.id,
    });
  });
}

/** A further message from the customer, sent from their case page. */
export async function addCustomerReply(token: string, text: string): Promise<Complaint> {
  const body = clean(text, MAX_BODY);
  if (body.length < 2) throw new ComplaintError("Write a message first.");

  return db.transaction(async (tx) => {
    const [found] = await tx.select().from(complaints).where(eq(complaints.publicToken, token)).for("update");
    if (!found) throw new ComplaintError("That case could not be found.", 404);
    if (found.status === "escalated") {
      throw new ComplaintError("This case is now being handled through your bank.", 409);
    }

    const [recent] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(complaintMessages)
      .where(
        and(
          eq(complaintMessages.complaintId, found.id),
          eq(complaintMessages.direction, "inbound"),
          gt(complaintMessages.createdAt, new Date(Date.now() - 10 * 60 * 1000)),
        ),
      );
    if ((recent?.count ?? 0) >= 6) {
      throw new ComplaintError("Please wait a few minutes before sending another message.", 429);
    }

    await tx.insert(complaintMessages).values({
      complaintId: found.id,
      direction: "inbound",
      authorLabel: found.customerName ?? "Customer",
      body,
    });
    const [updated] = await tx
      .update(complaints)
      .set({ status: "investigating", resolvedAt: null, updatedAt: new Date() })
      .where(eq(complaints.id, found.id))
      .returning();

    if (found.orderId) {
      await appendLedgerEvent(
        {
          merchantId: found.merchantId,
          orderId: found.orderId,
          type: "complaint.customer_replied",
          actor: { type: "customer", label: found.customerName ?? "Customer" },
          source: "web_form",
          sourceRef: found.number,
          summary: `The customer replied about complaint ${found.number}.`,
          payload: { complaintNumber: found.number, message: body },
        },
        tx,
      );
    }
    return updated;
  });
}

const RESOLUTIONS: ComplaintResolution[] = [
  "clarified",
  "refunded",
  "partially_refunded",
  "replacement_sent",
  "declined",
  "other",
];

/** Close a complaint with the outcome the merchant chose. */
export async function resolveComplaint(
  context: SessionContext,
  complaintId: string,
  input: { resolution: ComplaintResolution; note?: string | null },
): Promise<Complaint> {
  if (!RESOLUTIONS.includes(input.resolution)) throw new ComplaintError("Choose how the complaint was resolved.");
  const note = clean(input.note, 1000) || null;
  const merchantId = context.merchant.id;

  return db.transaction(async (tx) => {
    const complaint = await lockComplaint(tx, merchantId, complaintId);
    if (complaint.status === "escalated") {
      throw new ComplaintError("This complaint became a chargeback. Respond to it from Disputes.", 409);
    }
    const now = new Date();
    const [updated] = await tx
      .update(complaints)
      .set({ status: "resolved", resolution: input.resolution, resolutionNote: note, resolvedAt: now, updatedAt: now })
      .where(eq(complaints.id, complaint.id))
      .returning();

    if (complaint.orderId) {
      await appendLedgerEvent(
        {
          merchantId,
          orderId: complaint.orderId,
          type: "complaint.resolved",
          occurredAt: now,
          actor: { type: "user", id: context.user.id, label: context.user.name },
          source: "merchant_app",
          sourceRef: complaint.number,
          summary:
            `Complaint ${complaint.number} closed by ${context.user.name}: ${sentenceCase(input.resolution).toLowerCase()}.` +
            (note ? ` Note: ${note}` : ""),
          payload: { complaintNumber: complaint.number, resolution: input.resolution, note },
        },
        tx,
      );
    }
    return updated;
  });
}

/** Record that a replacement was arranged. The order's own shipment is unchanged. */
export async function recordReplacement(
  context: SessionContext,
  complaintId: string,
  description: string,
): Promise<void> {
  const text = clean(description, 500);
  if (text.length < 3) throw new ComplaintError("Say what is being sent as a replacement.");
  const merchantId = context.merchant.id;

  await db.transaction(async (tx) => {
    const complaint = await lockComplaint(tx, merchantId, complaintId);
    if (!complaint.orderId) throw new ComplaintError("Link this complaint to an order first.", 409);
    await appendLedgerEvent(
      {
        merchantId,
        orderId: complaint.orderId,
        type: "replacement.sent",
        actor: { type: "user", id: context.user.id, label: context.user.name },
        source: "merchant_app",
        sourceRef: complaint.number,
        summary: `${context.user.name} arranged a replacement for complaint ${complaint.number}: ${text}`,
        payload: { complaintNumber: complaint.number, replacement: text },
      },
      tx,
    );
    await tx.insert(complaintMessages).values({
      complaintId: complaint.id,
      direction: "internal",
      authorLabel: context.user.name,
      body: `Replacement arranged: ${text}`,
      createdByUserId: context.user.id,
    });
  });
}

/** Mark the open complaints on an order as having become a chargeback. */
export async function escalateComplaintsForOrder(tx: Tx, orderId: string): Promise<Complaint | null> {
  const open = await tx
    .select()
    .from(complaints)
    .where(eq(complaints.orderId, orderId))
    .orderBy(desc(complaints.createdAt));
  if (open.length === 0) return null;
  const active = open.filter((complaint) => complaint.status !== "resolved" && complaint.status !== "escalated");
  if (active.length > 0) {
    await tx
      .update(complaints)
      .set({ status: "escalated", updatedAt: new Date() })
      .where(
        inArray(
          complaints.id,
          active.map((complaint) => complaint.id),
        ),
      );
  }
  // The most recent complaint is the one the dispute most likely follows.
  return open[0];
}
