import { and, desc, eq } from "drizzle-orm";
import Stripe from "stripe";

import { db, type Tx } from "@/db/client";
import { orders, payments, refunds, type Order, type Payment, type Refund } from "@/db/schema";
import type { SessionContext } from "@/lib/auth/session";
import { appendLedgerEvent, type LedgerActor } from "@/lib/ledger/append";
import { formatMoney } from "@/lib/utils";
import { getStripe, ORDER_ID_METADATA_KEY, ORDER_NUMBER_METADATA_KEY } from "./client";

export class RefundError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "RefundError";
  }
}

type RecordInput = {
  order: Order;
  payment: Payment;
  amountMinor: number;
  stripeRefundId: string | null;
  status: string;
  reason: string | null;
  note: string | null;
  actor: LedgerActor;
  source: string;
  createdByUserId: string | null;
  createdAt: Date;
};

/**
 * Write a refund to the database and the ledger. Safe to call twice for the
 * same Stripe refund: the second call changes nothing.
 */
async function recordRefund(tx: Tx, input: RecordInput): Promise<Refund | null> {
  const { order, payment } = input;
  const simulated = payment.provider === "simulated";

  const inserted = await tx
    .insert(refunds)
    .values({
      merchantId: order.merchantId,
      orderId: order.id,
      paymentId: payment.id,
      stripeRefundId: input.stripeRefundId,
      amountMinor: input.amountMinor,
      currency: payment.currency,
      reason: input.reason,
      status: input.status,
      simulated,
      createdByUserId: input.createdByUserId,
      createdAt: input.createdAt,
    })
    .onConflictDoNothing({ target: refunds.stripeRefundId })
    .returning();
  const refund = inserted[0];
  if (!refund) return null;

  const refundedTotal = Math.min(payment.amountMinor, payment.amountRefundedMinor + input.amountMinor);
  await tx.update(payments).set({ amountRefundedMinor: refundedTotal }).where(eq(payments.id, payment.id));
  if (order.paymentStatus !== "disputed") {
    await tx
      .update(orders)
      .set({ paymentStatus: refundedTotal >= payment.amountMinor ? "refunded" : "partially_refunded" })
      .where(eq(orders.id, order.id));
  }

  const full = refundedTotal >= payment.amountMinor;
  await appendLedgerEvent(
    {
      merchantId: order.merchantId,
      orderId: order.id,
      type: "refund.issued",
      occurredAt: input.createdAt,
      actor: input.actor,
      source: input.source,
      sourceRef: input.stripeRefundId,
      summary:
        `${full && input.amountMinor === payment.amountMinor ? "Full refund" : "Refund"} of ` +
        `${formatMoney(input.amountMinor, payment.currency)} issued to the original payment method` +
        (input.actor.type === "user" && input.actor.label ? ` by ${input.actor.label}` : "") +
        `. ${formatMoney(refundedTotal, payment.currency)} of ${formatMoney(payment.amountMinor, payment.currency)} now refunded.` +
        (input.note ? ` Note: ${input.note}` : ""),
      payload: {
        amountMinor: input.amountMinor,
        currency: payment.currency,
        refundedTotalMinor: refundedTotal,
        paymentAmountMinor: payment.amountMinor,
        stripeRefundId: input.stripeRefundId,
        status: input.status,
        reason: input.reason,
        note: input.note,
      },
      simulated,
      dedupeKey: input.stripeRefundId ? `refund:${input.stripeRefundId}` : undefined,
    },
    tx,
  );
  return refund;
}

/**
 * Refund all or part of an order's payment on a person's decision. Live
 * payments are refunded through Stripe; seeded demo payments are recorded as a
 * simulated refund.
 */
export async function refundOrder(
  context: SessionContext,
  orderId: string,
  input: { amountMinor?: number | null; note?: string | null; complaintNumber?: string | null },
): Promise<Refund> {
  const merchantId = context.merchant.id;
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.merchantId, merchantId)))
    .limit(1);
  if (!order) throw new RefundError("That order could not be found.", 404);

  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.orderId, order.id))
    .orderBy(desc(payments.paidAt))
    .limit(1);
  if (!payment) throw new RefundError("This order has no payment to refund.", 409);

  const remaining = payment.amountMinor - payment.amountRefundedMinor;
  if (remaining <= 0) throw new RefundError("This payment has already been refunded in full.", 409);
  const amountMinor = input.amountMinor ?? remaining;
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) throw new RefundError("Enter a refund amount.");
  if (amountMinor > remaining) {
    throw new RefundError(`Only ${formatMoney(remaining, payment.currency)} is left to refund on this payment.`);
  }

  const note = input.note?.trim().slice(0, 300) || null;
  let stripeRefundId: string | null = null;
  let status = "succeeded";
  let createdAt = new Date();

  if (payment.provider === "stripe") {
    if (!payment.paymentIntentId) throw new RefundError("This payment cannot be refunded from here.", 409);
    try {
      const refund = await getStripe().refunds.create(
        {
          payment_intent: payment.paymentIntentId,
          amount: amountMinor,
          reason: "requested_by_customer",
          metadata: {
            [ORDER_ID_METADATA_KEY]: order.id,
            [ORDER_NUMBER_METADATA_KEY]: order.number,
            ...(input.complaintNumber ? { ps_complaint_number: input.complaintNumber } : {}),
          },
        },
        // Stops a double click from refunding twice.
        { idempotencyKey: `ps-refund:${payment.id}:${payment.amountRefundedMinor}:${amountMinor}` },
      );
      stripeRefundId = refund.id;
      status = refund.status ?? "pending";
      createdAt = new Date(refund.created * 1000);
    } catch (error) {
      if (error instanceof Stripe.errors.StripeError) {
        if (error.code === "charge_disputed") {
          throw new RefundError(
            "This payment has an open chargeback, so the card network does not allow a refund. Respond to the dispute instead.",
            409,
          );
        }
        if (error.code === "charge_already_refunded") {
          throw new RefundError("This payment has already been refunded.", 409);
        }
        throw new RefundError(`The payment processor declined the refund: ${error.message}`, 502);
      }
      throw error;
    }
  }

  const recorded = await db.transaction(async (tx) => {
    // Re-read inside the transaction so concurrent refunds add up correctly.
    const [lockedOrder] = await tx.select().from(orders).where(eq(orders.id, order.id)).for("update");
    const [freshPayment] = await tx.select().from(payments).where(eq(payments.id, payment.id)).limit(1);
    return recordRefund(tx, {
      order: lockedOrder,
      payment: freshPayment,
      amountMinor,
      stripeRefundId,
      status,
      reason: "requested_by_customer",
      note,
      actor: { type: "user", id: context.user.id, label: context.user.name },
      source: payment.provider === "stripe" ? "stripe" : "merchant_app",
      createdByUserId: context.user.id,
      createdAt,
    });
  });

  if (recorded) return recorded;
  // The webhook for this refund got there first; return what it recorded.
  const [existing] = await db.select().from(refunds).where(eq(refunds.stripeRefundId, stripeRefundId!)).limit(1);
  return existing;
}

/**
 * Bring refunds made outside the app (for example in the Stripe Dashboard)
 * onto the order. Called for `charge.refunded` events.
 */
export async function syncRefundsForCharge(chargeId: string): Promise<{ status: "recorded" | "unknown_order" | "nothing_new"; count: number }> {
  const [payment] = await db.select().from(payments).where(eq(payments.chargeId, chargeId)).limit(1);
  if (!payment) return { status: "unknown_order", count: 0 };

  const list = await getStripe().refunds.list({ charge: chargeId, limit: 100 });
  const ordered = [...list.data].sort((a, b) => a.created - b.created);

  let count = 0;
  for (const refund of ordered) {
    if (refund.status === "failed" || refund.status === "canceled") continue;
    const recorded = await db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, payment.orderId)).for("update");
      const [freshPayment] = await tx.select().from(payments).where(eq(payments.id, payment.id)).limit(1);
      return recordRefund(tx, {
        order,
        payment: freshPayment,
        amountMinor: refund.amount,
        stripeRefundId: refund.id,
        status: refund.status ?? "pending",
        reason: refund.reason ?? null,
        note: null,
        actor: { type: "integration", label: "Stripe" },
        source: "stripe",
        createdByUserId: null,
        createdAt: new Date(refund.created * 1000),
      });
    });
    if (recorded) count++;
  }
  return { status: count > 0 ? "recorded" : "nothing_new", count };
}
