import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { merchants } from "@/db/schema";
import type { SessionContext } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { InputError } from "@/lib/forms";
import { getStripe } from "./client";
import { hasSubscription } from "@/lib/subscription";

export const VERITY_MONTHLY_PRICE = 249;
export async function createSubscriptionCheckout(context: SessionContext) {
  if (!/^(sk|rk)_test_/.test(env.stripeSecretKey)) throw new InputError("This demo only supports a Stripe test-mode key. No live subscription will be created.");
  if (hasSubscription(context.merchant)) throw new InputError("Your test subscription is already active.");
  const checkout = await getStripe().checkout.sessions.create({
    mode: "subscription", client_reference_id: context.merchant.id,
    metadata: { kind: "verity_subscription", merchant_id: context.merchant.id },
    subscription_data: { metadata: { kind: "verity_subscription", merchant_id: context.merchant.id } },
    line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: VERITY_MONTHLY_PRICE, recurring: { interval: "month" }, product_data: { name: "Verity Premium", description: "AI complaint analysis, bank-response drafts and dispute assessments. Core workspace stays free. Test subscription." } } }],
    success_url: `${env.appUrl}/account?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.appUrl}/account?cancelled=1`,
  });
  if (!checkout.url) throw new InputError("Stripe did not return a checkout link.");
  return checkout.url;
}

export async function confirmSubscriptionCheckout(sessionId: string, expectedMerchantId?: string) {
  if (!/^cs_test_[A-Za-z0-9_]+$/.test(sessionId)) throw new InputError("Invalid test checkout reference.");
  const checkout = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
  const merchantId = checkout.metadata?.merchant_id;
  if (checkout.livemode || checkout.metadata?.kind !== "verity_subscription" || !merchantId || (expectedMerchantId && merchantId !== expectedMerchantId)) throw new InputError("This checkout does not belong to this workspace.");
  if (checkout.status !== "complete" || checkout.payment_status !== "paid") return false;
  const subscription = checkout.subscription;
  if (!subscription || typeof subscription === "string") throw new InputError("Subscription details are not available yet.");
  if (subscription.livemode || subscription.metadata.kind !== "verity_subscription" || subscription.metadata.merchant_id !== merchantId) throw new InputError("This subscription does not belong to this workspace.");
  const price = subscription.items.data[0]?.price;
  if (price?.currency !== "eur" || price.unit_amount !== VERITY_MONTHLY_PRICE || price.recurring?.interval !== "month") throw new InputError("This checkout uses an old plan. Start a new Premium checkout from Account.");
  await db.transaction(async tx => {
    const [merchant] = await tx.select().from(merchants).where(eq(merchants.id, merchantId)).for("update");
    if (!merchant) throw new InputError("Workspace not found.");
    if (hasSubscription(merchant) && merchant.settings.billing?.subscriptionId !== subscription.id) throw new InputError("A different Premium subscription is already active. This older checkout cannot replace it.");
    await tx.update(merchants).set({ settings: { ...merchant.settings, billing: { checkoutSessionId: checkout.id, subscriptionId: subscription.id, status: subscription.status, testMode: true, paymentStatus: checkout.payment_status, amountPaid: checkout.amount_total ?? undefined, currency: checkout.currency ?? undefined, invoiceId: typeof checkout.invoice === "string" ? checkout.invoice : checkout.invoice?.id } } }).where(eq(merchants.id, merchantId));
  });
  return true;
}

/** Re-read Stripe rather than trusting event order or client-supplied status. */
export async function syncSubscriptionStatus(subscriptionId: string) {
  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  const merchantId = subscription.metadata.merchant_id;
  if (subscription.livemode || subscription.metadata.kind !== "verity_subscription" || !merchantId) return false;
  return db.transaction(async tx => {
    const [merchant] = await tx.select().from(merchants).where(eq(merchants.id, merchantId)).for("update");
    if (!merchant || merchant.settings.billing?.subscriptionId !== subscription.id) return false;
    await tx.update(merchants).set({ settings: { ...merchant.settings, billing: { ...merchant.settings.billing, status: subscription.status } } }).where(eq(merchants.id, merchantId));
    return true;
  });
}

export async function cancelTestSubscription(context: SessionContext) {
  const id = context.merchant.settings.billing?.subscriptionId;
  if (!id) throw new InputError("There is no subscription to cancel.");
  const subscription = await getStripe().subscriptions.retrieve(id);
  if (subscription.livemode || subscription.metadata.kind !== "verity_subscription" || subscription.metadata.merchant_id !== context.merchant.id) throw new InputError("This is not your workspace’s test subscription.");
  if (subscription.status !== "canceled") await getStripe().subscriptions.cancel(id);
  await syncSubscriptionStatus(id);
}
