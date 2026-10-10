import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { merchants } from "@/db/schema";
import type { SessionContext } from "@/lib/auth/session";
const stripe = vi.hoisted(() => ({ retrieveCheckout: vi.fn(), retrieveSubscription: vi.fn(), cancel: vi.fn() }));
vi.mock("@/lib/stripe/client", () => ({ getStripe: () => ({ checkout: { sessions: { retrieve: stripe.retrieveCheckout } }, subscriptions: { retrieve: stripe.retrieveSubscription, cancel: stripe.cancel } }) }));
import { confirmSubscriptionCheckout, syncSubscriptionStatus, cancelTestSubscription } from "@/lib/stripe/billing";

describe("Premium checkout verification and subscription lifecycle", () => {
  let merchant: typeof merchants.$inferSelect;
  const subscription = { id: `sub_${randomUUID()}`, status: "active", livemode: false, metadata: { kind: "verity_subscription", merchant_id: "" }, items: { data: [{ price: { currency: "eur", unit_amount: 249, recurring: { interval: "month" } } }] } };
  beforeAll(async () => {
    [merchant] = await db.insert(merchants).values({ slug: `billing-${randomUUID()}`, name: "Billing test", settings: {} }).returning();
    subscription.metadata.merchant_id = merchant.id;
    stripe.retrieveSubscription.mockImplementation(async () => subscription);
    stripe.cancel.mockImplementation(async () => { subscription.status = "canceled"; return subscription; });
  });
  afterAll(async () => { if (merchant) await db.delete(merchants).where(eq(merchants.id, merchant.id)); });
  it("rejects unpaid, foreign and old annual checkouts", async () => {
    const checkout = { id: "cs_test_demo", livemode: false, metadata: subscription.metadata, status: "open", payment_status: "unpaid", amount_total: 249, currency: "eur", invoice: "in_demo", subscription };
    stripe.retrieveCheckout.mockResolvedValue(checkout);
    expect(await confirmSubscriptionCheckout(checkout.id, merchant.id)).toBe(false);
    await expect(confirmSubscriptionCheckout(checkout.id, randomUUID())).rejects.toThrow("does not belong");
    checkout.status = "complete"; checkout.payment_status = "paid";
    subscription.items.data[0].price.recurring.interval = "year";
    await expect(confirmSubscriptionCheckout(checkout.id, merchant.id)).rejects.toThrow("old plan");
    subscription.items.data[0].price.recurring.interval = "month";
    expect(await confirmSubscriptionCheckout(checkout.id, merchant.id)).toBe(true);
    const [saved] = await db.select().from(merchants).where(eq(merchants.id, merchant.id));
    expect(saved.settings.billing).toMatchObject({ paymentStatus: "paid", amountPaid: 249, currency: "eur", invoiceId: "in_demo" });
    const original = subscription.id;
    subscription.id = "sub_older";
    await expect(confirmSubscriptionCheckout(checkout.id, merchant.id)).rejects.toThrow("cannot replace");
    subscription.id = original;
  });
  it("reconciles cancellation and ignores a different subscription", async () => {
    [merchant] = await db.select().from(merchants).where(eq(merchants.id, merchant.id));
    await cancelTestSubscription({ merchant } as SessionContext);
    const [updated] = await db.select().from(merchants).where(eq(merchants.id, merchant.id));
    expect(updated.settings.billing?.status).toBe("canceled");
    const original = subscription.id;
    subscription.id = "sub_unrelated";
    expect(await syncSubscriptionStatus(subscription.id)).toBe(false);
    subscription.id = original;
  });
});
