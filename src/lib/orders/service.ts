import { and, eq, inArray, sql } from "drizzle-orm";

import { db, type Tx } from "@/db/client";
import {
  merchants,
  orderItems,
  orders,
  products,
  type Address,
  type Merchant,
  type Order,
  type OrderItem,
  type OrderSource,
} from "@/db/schema";
import { DEMO_SHIPPING_MINOR } from "@/lib/catalog";

export type CartLine = { sku: string; quantity: number };

export class OrderInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderInputError";
  }
}

const MAX_LINES = 12;
const MAX_QUANTITY = 10;

/** Next order number for a merchant, e.g. VB-1001. Call inside a transaction. */
export async function allocateOrderNumber(
  tx: Tx,
  merchant: Pick<Merchant, "id" | "settings">,
): Promise<{ number: string; counter: number }> {
  const [row] = await tx
    .update(merchants)
    .set({ orderCounter: sql`${merchants.orderCounter} + 1` })
    .where(eq(merchants.id, merchant.id))
    .returning({ counter: merchants.orderCounter });
  const prefix = merchant.settings.orderPrefix ?? "PS";
  return { number: `${prefix}-${row.counter}`, counter: row.counter };
}

/** The numeric part of an order number, used to derive the tracking number. */
export function orderSequence(orderNumber: string): number {
  const match = /(\d+)$/.exec(orderNumber);
  return match ? Number(match[1]) : 0;
}

export type NewOrderDetails = {
  customerEmail?: string | null;
  customerName?: string | null;
  shippingAddress?: Address | null;
  billingAddress?: Address | null;
  simulated?: boolean;
  placedAt?: Date;
};

/**
 * Create an unpaid order from cart lines. Prices and names always come from
 * the catalogue, never from the browser.
 */
export async function createPendingOrder(
  merchant: Merchant,
  lines: CartLine[],
  source: OrderSource,
  details: NewOrderDetails = {},
): Promise<{ order: Order; items: OrderItem[] }> {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new OrderInputError("Your basket is empty.");
  }
  if (lines.length > MAX_LINES) {
    throw new OrderInputError("That is too many different items for one order.");
  }

  const quantities = new Map<string, number>();
  for (const line of lines) {
    const quantity = Number(line?.quantity);
    if (typeof line?.sku !== "string" || !Number.isInteger(quantity) || quantity < 1) {
      throw new OrderInputError("The basket contains an invalid item.");
    }
    const total = (quantities.get(line.sku) ?? 0) + quantity;
    if (total > MAX_QUANTITY) {
      throw new OrderInputError(`You can order up to ${MAX_QUANTITY} of each item.`);
    }
    quantities.set(line.sku, total);
  }

  const catalogue = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.merchantId, merchant.id),
        eq(products.active, true),
        inArray(products.sku, [...quantities.keys()]),
      ),
    );
  if (catalogue.length !== quantities.size) {
    throw new OrderInputError("One of the items in your basket is no longer available.");
  }

  const subtotalMinor = catalogue.reduce(
    (sum, product) => sum + product.priceMinor * (quantities.get(product.sku) ?? 0),
    0,
  );
  const shippingMinor = DEMO_SHIPPING_MINOR;

  return db.transaction(async (tx) => {
    const { number } = await allocateOrderNumber(tx, merchant);
    const [order] = await tx
      .insert(orders)
      .values({
        merchantId: merchant.id,
        number,
        source,
        currency: merchant.currency,
        subtotalMinor,
        shippingMinor,
        totalMinor: subtotalMinor + shippingMinor,
        customerEmail: details.customerEmail ?? null,
        customerName: details.customerName ?? null,
        shippingAddress: details.shippingAddress ?? null,
        billingAddress: details.billingAddress ?? null,
        simulated: details.simulated ?? false,
        placedAt: details.placedAt ?? new Date(),
      })
      .returning();

    const items = await tx
      .insert(orderItems)
      .values(
        catalogue
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((product) => ({
            orderId: order.id,
            productId: product.id,
            sku: product.sku,
            barcode: product.barcode,
            name: product.name,
            art: product.art,
            quantity: quantities.get(product.sku) ?? 1,
            unitPriceMinor: product.priceMinor,
          })),
      )
      .returning();

    return { order, items };
  });
}

/** Total units across an order's lines. */
export function unitCount(items: Pick<OrderItem, "quantity">[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}
