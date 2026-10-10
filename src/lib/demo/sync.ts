import { randomBytes } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { accessLogs, merchants, orders, orderItems, payments, products, packingSessions, shipments, complaints, complaintMessages } from "@/db/schema";
import type { SessionContext } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { allocateOrderNumber } from "@/lib/orders/service";
import { appendLedgerEvent } from "@/lib/ledger/append";
import { simulateDispute, DisputeError } from "@/lib/disputes/service";

export const DEMO_SOURCES = [
  { key: "shopify_demo", name: "Shopify", detail: "Orders & customer details", count: 4 },
  { key: "stripe_demo", name: "Stripe", detail: "Payments & card checks", count: 4 },
  { key: "warehouse_demo", name: "Warehouse", detail: "Item scans & packing checks", count: 3 },
  { key: "carrier_demo", name: "Courier", detail: "Tracking & delivery events", count: 3 },
  { key: "support_demo", name: "Support inbox", detail: "Customer conversations", count: 2 },
  { key: "bank_demo", name: "Bank disputes", detail: "Chargebacks & deadlines", count: 1 },
] as const;

/** Stable fixtures model API responses. Repeated syncs never duplicate an order. */
export async function syncDemoData(context: SessionContext) {
  if (!env.demoMode) throw new DisputeError("API simulation is only available in demo mode.");
  const result = await db.transaction(async tx => {
    await tx.select().from(merchants).where(eq(merchants.id, context.merchant.id)).for("update");
    const catalog = await tx.select().from(products).where(eq(products.merchantId, context.merchant.id)).orderBy(asc(products.sortOrder)).limit(4);
    if (catalog.length < 4) throw new DisputeError("Load the demo catalogue first.");
    let added = 0;
    const orderIds: string[] = [];
    for (let index = 0; index < 4; index++) {
      const externalId = `verity-api-demo-v1-${index}`;
      const [existing] = await tx.select().from(orders).where(and(eq(orders.merchantId, context.merchant.id), eq(orders.sourceOrderId, externalId)));
      if (existing) { orderIds.push(existing.id); continue; }
      const item = catalog[index];
      const name = ["Jamie Murphy", "Alex Kelly", "Sam Walsh", "Robin Byrne"][index];
      const email = ["jamie", "alex", "sam", "robin"][index] + "@example.test";
      const placedAt = new Date(Date.now() - (5 - index) * 86400000);
      const packedAt = new Date(placedAt.getTime() + 3600000);
      const deliveredAt = new Date(placedAt.getTime() + 2 * 86400000);
      const address = { name, line1: `${index + 1} Demo Lane`, city: "Dublin", postalCode: "D02 DEMO", country: "IE" };
      const { number } = await allocateOrderNumber(tx, context.merchant);
      const total = item.priceMinor + 495;
      const [order] = await tx.insert(orders).values({ merchantId: context.merchant.id, number, source: "seed", sourceOrderId: externalId, customerName: name, customerEmail: email, shippingAddress: address, billingAddress: address, currency: "eur", subtotalMinor: item.priceMinor, shippingMinor: 495, totalMinor: total, simulated: true, paymentStatus: "paid", fulfilmentStatus: index === 3 ? "unfulfilled" : "delivered", placedAt, paidAt: placedAt, packedAt: index < 3 ? packedAt : null, deliveredAt: index < 3 ? deliveredAt : null }).returning();
      orderIds.push(order.id);
      const [line] = await tx.insert(orderItems).values({ orderId: order.id, productId: item.id, sku: item.sku, barcode: item.barcode, name: item.name, art: item.art, quantity: 1, unitPriceMinor: item.priceMinor }).returning();
      await tx.insert(payments).values({ merchantId: context.merchant.id, orderId: order.id, provider: "simulated", amountMinor: total, currency: "eur", status: "succeeded", cardBrand: "visa", cardLast4: "4242", cvcCheck: "pass", postalCodeCheck: "pass", paidAt: placedAt });
      const common = { merchantId: context.merchant.id, orderId: order.id, actor: { type: "integration" as const, label: "API simulator" }, simulated: true };
      await appendLedgerEvent({ ...common, type: "order.placed", source: "shopify_demo", sourceRef: externalId, occurredAt: placedAt, summary: `Shopify API simulation: ${number}, ${item.name}, customer ${name}.`, payload: { totalMinor: total, currency: "eur", item: item.name } }, tx);
      await appendLedgerEvent({ ...common, type: "payment.succeeded", source: "stripe_demo", occurredAt: placedAt, summary: "Stripe API simulation: payment succeeded; CVC and postcode checks passed.", payload: { amountMinor: total, currency: "eur", cardLast4: "4242", cvcCheck: "pass", postalCodeCheck: "pass" } }, tx);
      if (index < 3) {
        const short = index === 1;
        await tx.insert(packingSessions).values({ merchantId: context.merchant.id, orderId: order.id, packerName: "Demo warehouse", status: short ? "completed_with_exceptions" : "completed", itemCounts: { [line.id]: short ? 0 : 1 }, simulated: true, startedAt: packedAt, completedAt: packedAt, labelVerified: true, exceptions: short ? [{ kind: "short_pack", overridden: true, note: "Item unavailable; parcel continued with an exception.", at: packedAt.toISOString() }] : [] });
        await appendLedgerEvent({ ...common, type: short ? "packing.override" : "packing.completed", source: "warehouse_demo", occurredAt: packedAt, summary: short ? "Warehouse API simulation: item was not scanned; short-pack override recorded." : "Warehouse API simulation: ordered item and shipping label verified. No packing photo supplied by this fixture.", payload: { verifiedQuantity: short ? 0 : 1, orderedQuantity: 1 } }, tx);
        await tx.insert(shipments).values({ merchantId: context.merchant.id, orderId: order.id, carrier: "Demo courier", service: "Tracked", trackingNumber: `DEMO-${order.id}`, status: "delivered", simulated: true, handedToCarrierAt: packedAt, deliveredAt, proofOfDelivery: { method: "signature", signedBy: name, note: "Simulated carrier record, not a real signature." } });
        await appendLedgerEvent({ ...common, type: "shipment.delivered", source: "carrier_demo", sourceRef: `DEMO-${order.id}`, occurredAt: deliveredAt, summary: `Courier API simulation: delivery recorded at the order address, signed by ${name}.`, payload: { trackingNumber: `DEMO-${order.id}`, signedBy: name, address } }, tx);
      }
      if (index < 2) {
        const body = index === 0 ? "My earbuds have not arrived. Please investigate the delivery or refund my order." : "My parcel arrived but the charger was missing. Can you send a replacement?";
        const [merchant] = await tx.update(merchants).set({ complaintCounter: sql`${merchants.complaintCounter} + 1` }).where(eq(merchants.id, context.merchant.id)).returning();
        const [complaint] = await tx.insert(complaints).values({ merchantId: context.merchant.id, orderId: order.id, number: `C-${String(merchant.complaintCounter).padStart(4, "0")}`, channel: "email_paste", customerName: name, customerEmail: email, subject: index === 0 ? "Order has not arrived" : "Item missing from parcel", body, publicToken: randomBytes(24).toString("base64url"), simulated: true }).returning();
        await tx.insert(complaintMessages).values({ complaintId: complaint.id, direction: "inbound", authorLabel: name, body });
        await appendLedgerEvent({ ...common, type: "complaint.received", source: "support_demo", summary: `Support API simulation: ${body}`, payload: { complaintNumber: complaint.number, message: body } }, tx);
      }
      added++;
    }
    return { added, orderIds };
  });
  await simulateDispute(context, result.orderIds[0]);
  await db.insert(accessLogs).values(DEMO_SOURCES.map(source => ({ merchantId: context.merchant.id, userId: context.user.id, action: "demo_api_sync", targetType: source.key, targetId: `${source.count}` })));
  return { added: result.added, records: 17 };
}
