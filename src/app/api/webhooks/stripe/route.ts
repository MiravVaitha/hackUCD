import type Stripe from "stripe";

import { env, isStripeConfigured, isWebhookConfigured } from "@/lib/env";
import { describeStripeError, getStripe } from "@/lib/stripe/client";
import { processStripeEvent } from "@/lib/stripe/events";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Stripe webhook endpoint. The signature is verified against the raw body
 * before anything else happens; unsigned or tampered requests are rejected.
 */
export async function POST(request: Request) {
  if (!isStripeConfigured() || !isWebhookConfigured()) {
    return new Response("Stripe webhook is not configured on this deployment.", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature.", { status: 400 });

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, env.stripeWebhookSecret);
  } catch {
    return new Response("Signature verification failed.", { status: 400 });
  }

  try {
    const result = await processStripeEvent(event, "webhook");
    return Response.json({ received: true, status: result.status });
  } catch (error) {
    // Log the event reference only. A non-2xx answer makes Stripe retry.
    console.error("[stripe webhook] failed:", event.id, event.type, describeStripeError(error));
    return new Response("Event could not be processed.", { status: 500 });
  }
}
