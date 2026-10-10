import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  merchants,
  orderItems,
  orders,
  products,
  shipments,
  type Address,
  type Merchant,
  type Order,
} from "@/db/schema";
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

export const TEST_ADDRESS: Address = {
  name: "Test Customer",
  line1: "1 Test Street",
  city: "Cork",
  state: "Cork",
  postalCode: "T12 TEST",
  country: "IE",
};

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
      shippingAddress: TEST_ADDRESS,
      billingAddress: TEST_ADDRESS,
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

/** A paid, unpacked test order with items from the catalogue and a shipping label. */
export async function createPackableOrder(lines: { sku: string; quantity: number }[]): Promise<Order> {
  const merchant = await getDemoMerchant();
  const order = await createTestOrder({ paymentStatus: "paid", fulfilmentStatus: "unfulfilled", paidAt: new Date() });
  const catalogue = await db.select().from(products).where(eq(products.merchantId, merchant.id));
  for (const line of lines) {
    const product = catalogue.find((candidate) => candidate.sku === line.sku);
    if (!product) throw new Error(`Unknown test SKU ${line.sku}`);
    await db.insert(orderItems).values({
      orderId: order.id,
      productId: product.id,
      sku: product.sku,
      barcode: product.barcode,
      name: product.name,
      art: product.art,
      quantity: line.quantity,
      unitPriceMinor: product.priceMinor,
    });
  }
  await db.insert(shipments).values({
    merchantId: merchant.id,
    orderId: order.id,
    carrier: "SwiftParcel",
    service: "Tracked 48",
    trackingNumber: `SWP${Math.floor(Math.random() * 9_000_000) + 1_000_000}IE`,
    simulated: true,
  });
  return order;
}

export async function trackingNumberFor(orderId: string): Promise<string> {
  const [shipment] = await db.select().from(shipments).where(eq(shipments.orderId, orderId));
  return shipment.trackingNumber;
}

export async function productBarcode(sku: string): Promise<string> {
  const merchant = await getDemoMerchant();
  const catalogue = await db.select().from(products).where(eq(products.merchantId, merchant.id));
  const product = catalogue.find((candidate) => candidate.sku === sku);
  if (!product) throw new Error(`Unknown test SKU ${sku}`);
  return product.barcode;
}

export async function cleanupTestOrders(): Promise<void> {
  const ids = created.splice(0, created.length);
  await purgeOrders(ids);
}
