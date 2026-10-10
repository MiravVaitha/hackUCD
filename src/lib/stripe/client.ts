import Stripe from "stripe";

import { env } from "@/lib/env";

let client: Stripe | null = null;

/**
 * Shared Stripe client, created on first use so a missing key only fails the
 * features that need Stripe. The key is read from the environment and never
 * logged. The SDK's pinned API version is used.
 */
export function getStripe(): Stripe {
  client ??= new Stripe(env.stripeSecretKey, {
    appInfo: { name: "ProofShield AI (hackUCD demo)" },
    maxNetworkRetries: 2,
  });
  return client;
}

/** Metadata keys ProofShield puts on Stripe objects to find its own order again. */
export const ORDER_ID_METADATA_KEY = "ps_order_id";
export const ORDER_NUMBER_METADATA_KEY = "ps_order_number";

/** A short, loggable description of a Stripe error. Never includes request bodies or keys. */
export function describeStripeError(error: unknown): string {
  if (error instanceof Stripe.errors.StripeError) {
    return [error.type, error.code, error.message].filter(Boolean).join(": ");
  }
  return error instanceof Error ? error.message : "Unknown error";
}
