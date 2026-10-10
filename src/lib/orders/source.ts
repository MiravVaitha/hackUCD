import type { OrderSource } from "@/db/schema";

/**
 * Where orders come from. The demo store is the only source wired up.
 *
 * A Shopify adapter would implement the same idea from the other direction:
 * map `orders/create` and `orders/updated` webhooks onto createPendingOrder()
 * and the payment recorder, and translate "packed" and "handed to carrier"
 * into Shopify fulfilment updates. Nothing else in the app needs to know
 * which source an order came from.
 */
export const ORDER_SOURCES: Record<OrderSource, { label: string; live: boolean }> = {
  demo_store: { label: "Voltbox demo store", live: true },
  seed: { label: "Seeded demo history", live: false },
  shopify: { label: "Shopify", live: false },
};

export function orderSourceLabel(source: OrderSource): string {
  return ORDER_SOURCES[source]?.label ?? source;
}
