import { and, inArray, lt } from "drizzle-orm";
import type Stripe from "stripe";

import { db } from "@/db/client";
import { stripeEvents } from "@/db/schema";
import { isStripeConfigured } from "@/lib/env";
import { describeStripeError, getStripe } from "./client";
import { HANDLED_EVENT_TYPES, processStripeEvent } from "./events";

export type SyncResult = {
  ran: boolean;
  fetched: number;
  processed: number;
  ignored: number;
  failed: number;
  error?: string;
};

const DEFAULT_LOOKBACK_SECONDS = 24 * 60 * 60;
const MIN_INTERVAL_MS = 8_000;
const MAX_EVENTS = 300;

let lastRunAt = 0;
let inFlight: Promise<SyncResult> | null = null;

/**
 * Reconcile with Stripe's Events API: fetch recent events of the types the app
 * handles and process any that have not been processed yet.
 *
 * This is a safety net behind the webhook, and the way events arrive when the
 * app runs somewhere Stripe cannot reach, such as localhost.
 */
export async function syncStripeEvents(
  options: { force?: boolean; lookbackSeconds?: number } = {},
): Promise<SyncResult> {
  const skipped: SyncResult = { ran: false, fetched: 0, processed: 0, ignored: 0, failed: 0 };
  if (!isStripeConfigured()) return skipped;
  if (inFlight) return inFlight;
  if (!options.force && Date.now() - lastRunAt < MIN_INTERVAL_MS) return skipped;

  lastRunAt = Date.now();
  inFlight = runSync(options.lookbackSeconds ?? DEFAULT_LOOKBACK_SECONDS).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync(lookbackSeconds: number): Promise<SyncResult> {
  const result: SyncResult = { ran: true, fetched: 0, processed: 0, ignored: 0, failed: 0 };

  let events: Stripe.Event[] = [];
  try {
    const since = Math.floor(Date.now() / 1000) - lookbackSeconds;
    for await (const event of getStripe().events.list({
      types: [...HANDLED_EVENT_TYPES],
      created: { gte: since },
      limit: 100,
    })) {
      events.push(event);
      if (events.length >= MAX_EVENTS) break;
    }
  } catch (error) {
    return { ...result, error: describeStripeError(error) };
  }
  result.fetched = events.length;
  if (events.length === 0) return result;

  // Skip events that are already finished. Failed and unfinished ones go back
  // through processStripeEvent, which decides whether they can be retried.
  const settled = await db
    .select({ id: stripeEvents.id })
    .from(stripeEvents)
    .where(
      and(
        inArray(
          stripeEvents.id,
          events.map((event) => event.id),
        ),
        inArray(stripeEvents.status, ["processed", "ignored"]),
      ),
    );
  const settledIds = new Set(settled.map((row) => row.id));

  events = events
    .filter((event) => !settledIds.has(event.id))
    .sort((a, b) => a.created - b.created);

  for (const event of events) {
    try {
      const outcome = await processStripeEvent(event, "sync");
      if (outcome.status === "processed") result.processed++;
      else if (outcome.status === "ignored") result.ignored++;
    } catch (error) {
      result.failed++;
      console.error("[stripe sync] event failed:", event.id, event.type, describeStripeError(error));
    }
  }

  return result;
}

/** Remove bookkeeping rows for events older than Stripe keeps them. */
export async function pruneOldStripeEvents(): Promise<void> {
  const cutoff = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
  await db.delete(stripeEvents).where(lt(stripeEvents.stripeCreatedAt, cutoff));
}
