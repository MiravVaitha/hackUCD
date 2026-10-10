"use server";

import { CONSOLE_ROLES, requireUserForAction } from "@/lib/auth/guards";
import { verifyOrderLedger, type LedgerVerification } from "@/lib/ledger/verify";

export async function verifyLedgerAction(
  orderId: string,
): Promise<LedgerVerification | { error: string }> {
  try {
    const session = await requireUserForAction(CONSOLE_ROLES);
    const report = await verifyOrderLedger(orderId, session.merchant.id);
    return report ?? { error: "That order could not be found." };
  } catch {
    return { error: "The integrity check could not be run. Please try again." };
  }
}
