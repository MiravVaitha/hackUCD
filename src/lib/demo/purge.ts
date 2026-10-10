import { inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { orders } from "@/db/schema";

/**
 * Permanently delete whole orders together with their evidence.
 *
 * Evidence tables reject UPDATE and DELETE. This is the one deliberate way
 * around that, used only by the demo reset and by test clean-up: it sets a
 * transaction-local flag that the protection trigger checks. Individual
 * evidence rows still cannot be edited, with or without the flag.
 */
export async function purgeOrders(orderIds: string[]): Promise<number> {
  if (orderIds.length === 0) return 0;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('proofshield.allow_evidence_delete', 'on', true)`);
    const deleted = await tx
      .delete(orders)
      .where(inArray(orders.id, orderIds))
      .returning({ id: orders.id });
    return deleted.length;
  });
}
