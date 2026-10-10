import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { complaints, disputes, orders } from "@/db/schema";

export type NavCounts = {
  toPack: number;
  openComplaints: number;
  disputesToAnswer: number;
};

/** Work waiting in each area, shown as counters in the navigation. */
export async function getNavCounts(merchantId: string): Promise<NavCounts> {
  const [[toPack], [openComplaints], [disputesToAnswer]] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(
        and(
          eq(orders.merchantId, merchantId),
          inArray(orders.paymentStatus, ["paid", "disputed"]),
          inArray(orders.fulfilmentStatus, ["unfulfilled", "packing"]),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(complaints)
      .where(
        and(
          eq(complaints.merchantId, merchantId),
          inArray(complaints.status, ["new", "investigating", "awaiting_customer"]),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(disputes)
      .where(
        and(
          eq(disputes.merchantId, merchantId),
          eq(disputes.held, false),
          isNull(disputes.outcome),
          inArray(disputes.stripeStatus, ["needs_response", "warning_needs_response"]),
        ),
      ),
  ]);

  return {
    toPack: toPack?.count ?? 0,
    openComplaints: openComplaints?.count ?? 0,
    disputesToAnswer: disputesToAnswer?.count ?? 0,
  };
}
