import { and, eq, lt, ne, notInArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { disputes, orders } from "@/db/schema";

export type CustomerHistory = {
  earlierOrders: number;
  earlierOrdersDelivered: number;
  earlierOrdersDisputed: number;
  firstOrderAt: Date | null;
};

/**
 * A customer's earlier paid orders with this merchant, matched by email.
 * Relevant to fraud disputes, where prior undisputed purchases are evidence.
 */
export async function getCustomerHistory(
  merchantId: string,
  customerEmail: string | null,
  order: { id: string; placedAt: Date },
): Promise<CustomerHistory> {
  const empty: CustomerHistory = {
    earlierOrders: 0,
    earlierOrdersDelivered: 0,
    earlierOrdersDisputed: 0,
    firstOrderAt: null,
  };
  if (!customerEmail) return empty;

  const [row] = await db
    .select({
      earlierOrders: sql<number>`count(*)::int`,
      delivered: sql<number>`count(*) filter (where ${orders.deliveredAt} is not null)::int`,
      disputed: sql<number>`count(*) filter (where exists (
        select 1 from ${disputes} where ${disputes.orderId} = ${orders.id} and ${disputes.held} = false
      ))::int`,
      firstOrderAt: sql<Date | null>`min(${orders.placedAt})`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        eq(orders.customerEmail, customerEmail.toLowerCase()),
        ne(orders.id, order.id),
        lt(orders.placedAt, order.placedAt),
        notInArray(orders.paymentStatus, ["pending", "failed"]),
      ),
    );

  if (!row) return empty;
  return {
    earlierOrders: row.earlierOrders,
    earlierOrdersDelivered: row.delivered,
    earlierOrdersDisputed: row.disputed,
    firstOrderAt: row.firstOrderAt ? new Date(row.firstOrderAt) : null,
  };
}
