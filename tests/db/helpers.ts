import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { merchants, orders, type Merchant, type Order } from "@/db/schema";
import { DEMO_MERCHANT } from "@/lib/catalog";
import { purgeOrders } from "@/lib/demo/purge";

const created: string[] = [];

export async function getDemoMerchant(): Promise<Merchant> {
  const [merchant] = await db
    .select()
    .from(merchants)
    .where(eq(merchants.slug, DEMO_MERCHANT.slug))
    .limit(1);
  if (!merchant) {
    throw new Error("Demo merchant missing. Run `pnpm db:migrate && pnpm db:bootstrap` first.");
  }
  return merchant;
}

/** A throwaway order for tests. Removed by cleanupTestOrders(). */
export async function createTestOrder(overrides: Partial<typeof orders.$inferInsert> = {}): Promise<Order> {
  const merchant = await getDemoMerchant();
  const [order] = await db
    .insert(orders)
    .values({
      merchantId: merchant.id,
      number: `T-${randomBytes(4).toString("hex").toUpperCase()}`,
      source: "seed",
      simulated: true,
      customerEmail: "test.customer@example.test",
      customerName: "Test Customer",
      currency: "eur",
      subtotalMinor: 1400,
      shippingMinor: 495,
      totalMinor: 1895,
      paymentStatus: "paid",
      ...overrides,
    })
    .returning();
  created.push(order.id);
  return order;
}

export async function cleanupTestOrders(): Promise<void> {
  const ids = created.splice(0, created.length);
  await purgeOrders(ids);
}
