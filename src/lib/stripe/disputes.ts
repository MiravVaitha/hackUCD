import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db/client";
import { disputes, orders, payments } from "@/db/schema";
import { escalateComplaintsForOrder } from "@/lib/complaints/service";
import { appendLedgerEvent } from "@/lib/ledger/append";
import { getStripe } from "./client";
import { recordPaidPaymentIntent } from "./payments";

const objectId = (value: string | { id: string } | null | undefined) => typeof value === "string" ? value : value?.id;

/** Imports provider events only; never submits evidence or changes a bank decision. */
export async function syncDispute(disputeId: string, eventId: string, retrieve = (id: string) => getStripe().disputes.retrieve(id)) {
  const source: Stripe.Dispute = await retrieve(disputeId);
  const chargeId = objectId(source.charge);
  if (!chargeId) return false;
  let [payment] = await db.select().from(payments).where(eq(payments.chargeId, chargeId)).limit(1);
  if (!payment && objectId(source.payment_intent)) {
    await recordPaidPaymentIntent(objectId(source.payment_intent)!);
    [payment] = await db.select().from(payments).where(eq(payments.chargeId, chargeId)).limit(1);
  }
  if (!payment) return false;
  if (payment.livemode !== source.livemode) throw new Error("Dispute and payment environments differ");
  return db.transaction(async tx => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, payment.orderId)).for("update");
    const [existing] = await tx.select().from(disputes).where(eq(disputes.stripeDisputeId, source.id)).limit(1);
    const complaint = existing ? null : await escalateComplaintsForOrder(tx, order.id);
    const outcome = source.status === "won" ? "won" : source.status === "lost" ? "lost" : source.status === "warning_closed" ? "closed" : null;
    const values = { merchantId: order.merchantId, orderId: order.id, paymentId: payment.id, stripeDisputeId: source.id, chargeId, paymentIntentId: objectId(source.payment_intent) ?? null, amountMinor: source.amount, currency: source.currency, reason: source.reason, cardBrand: payment.cardBrand, stripeStatus: source.status, isInquiry: source.status.startsWith("warning_"), evidenceDueBy: source.evidence_details.due_by ? new Date(source.evidence_details.due_by * 1000) : null, livemode: source.livemode, stripeCreatedAt: new Date(source.created * 1000), outcome, closedAt: outcome ? existing?.closedAt ?? new Date() : null } as const;
    const [saved] = existing
      ? await tx.update(disputes).set(values).where(eq(disputes.id, existing.id)).returning()
      : await tx.insert(disputes).values({ ...values, complaintId: complaint?.id }).returning();
    if (!outcome) await tx.update(orders).set({ paymentStatus: "disputed" }).where(eq(orders.id, order.id));
    await appendLedgerEvent({ merchantId: order.merchantId, orderId: order.id, type: outcome ? "dispute.closed" : existing ? "dispute.updated" : "dispute.opened", source: "stripe", sourceRef: source.id, actor: { type: "integration", label: "Stripe" }, summary: `${source.livemode ? "Stripe" : "Stripe sandbox"} dispute: ${source.reason.replaceAll("_", " ")} · ${source.status.replaceAll("_", " ")}.`, payload: { disputeId: saved.id, status: source.status, reason: source.reason, amountMinor: source.amount, livemode: source.livemode }, simulated: !source.livemode, dedupeKey: `stripe-dispute:${eventId}` }, tx);
    return true;
  });
}
