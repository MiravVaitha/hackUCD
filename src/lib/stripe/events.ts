import { and, eq, lt } from "drizzle-orm";
import type Stripe from "stripe";

import { db } from "@/db/client";
import { stripeEvents } from "@/db/schema";
import { describeStripeError } from "./client";
import { markCheckoutFailed, recordPaidCheckoutSession } from "./payments";
import { syncRefundsForCharge } from "./refunds";

/** Event types the app acts on. Also the list to select on the webhook endpoint. */
export const HANDLED_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "charge.dispute.funds_withdrawn",
  "charge.dispute.funds_reinstated",
  "radar.early_fraud_warning.created",
] as const;

export type ProcessResult = {
  status: "processed" | "ignored" | "duplicate";
  note: string;
};

type HandlerOutcome = { status: "processed" | "ignored"; note: string };

/** A claim older than this is assumed to belong to a crashed run and can be retried. */
const STALE_CLAIM_MS = 3 * 60 * 1000;

/**
 * Claim an event so it is processed once, whether it arrives by webhook, by
 * reconcile, or both at the same moment. The event ID is the primary key.
 */
async function claimEvent(event: Stripe.Event, via: "webhook" | "sync"): Promise<boolean> {
  const values = {
    id: event.id,
    type: event.type,
    livemode: event.livemode,
    via,
    status: "processing" as const,
    note: null,
    stripeCreatedAt: new Date(event.created * 1000),
    processedAt: new Date(),
  };

  const inserted = await db
    .insert(stripeEvents)
    .values(values)
    .onConflictDoNothing({ target: stripeEvents.id })
    .returning({ id: stripeEvents.id });
  if (inserted.length > 0) return true;

  // Already seen. Retry only if an earlier attempt failed or never finished.
  const retried = await db
    .update(stripeEvents)
    .set({ status: "processing", via, processedAt: new Date(), note: null })
    .where(
      and(
        eq(stripeEvents.id, event.id),
        eq(stripeEvents.status, "failed"),
      ),
    )
    .returning({ id: stripeEvents.id });
  if (retried.length > 0) return true;

  const stale = await db
    .update(stripeEvents)
    .set({ status: "processing", via, processedAt: new Date(), note: null })
    .where(
      and(
        eq(stripeEvents.id, event.id),
        eq(stripeEvents.status, "processing"),
        lt(stripeEvents.processedAt, new Date(Date.now() - STALE_CLAIM_MS)),
      ),
    )
    .returning({ id: stripeEvents.id });
  return stale.length > 0;
}

async function handle(event: Stripe.Event): Promise<HandlerOutcome> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      // The event only tells us which session; the facts are re-read from Stripe.
      const result = await recordPaidCheckoutSession(event.data.object.id);
      if (result.status === "unknown_order") {
        return { status: "ignored", note: "Payment belongs to another environment" };
      }
      if (result.status === "not_paid") {
        return { status: "ignored", note: "Session is not paid yet" };
      }
      return { status: "processed", note: `${result.status} ${result.orderNumber}` };
    }

    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const changed = await markCheckoutFailed(event.data.object.id);
      return changed
        ? { status: "processed", note: "Order marked as not paid" }
        : { status: "ignored", note: "No pending order for this session" };
    }

    case "charge.refunded": {
      const result = await syncRefundsForCharge(event.data.object.id);
      if (result.status === "unknown_order") {
        return { status: "ignored", note: "Charge belongs to another environment" };
      }
      return { status: "processed", note: `${result.count} refund(s) recorded` };
    }

    default:
      return { status: "ignored", note: "No handler for this event type yet" };
  }
}

/**
 * Process one Stripe event idempotently. Throws if the handler fails, so the
 * webhook can answer with an error and Stripe retries.
 */
export async function processStripeEvent(
  event: Stripe.Event,
  via: "webhook" | "sync",
): Promise<ProcessResult> {
  if (!(await claimEvent(event, via))) {
    return { status: "duplicate", note: "Already processed" };
  }

  try {
    const outcome = await handle(event);
    await db
      .update(stripeEvents)
      .set({ status: outcome.status, note: outcome.note, processedAt: new Date() })
      .where(eq(stripeEvents.id, event.id));
    return outcome;
  } catch (error) {
    await db
      .update(stripeEvents)
      .set({ status: "failed", note: describeStripeError(error).slice(0, 500), processedAt: new Date() })
      .where(eq(stripeEvents.id, event.id));
    throw error;
  }
}
