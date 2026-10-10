"use server";

import { refresh } from "next/cache";

import type { ProofOfDelivery } from "@/db/schema";
import { CONSOLE_ROLES, requireUserForAction } from "@/lib/auth/guards";
import {
  CarrierError,
  recordHandover,
  simulateCarrierEvent,
  type CarrierStep,
} from "@/lib/carriers/demo-carrier";
import { env } from "@/lib/env";
import { verifyOrderLedger, type LedgerVerification } from "@/lib/ledger/verify";

export type ActionResult = { ok: true } | { ok: false; error: string };

function failure(error: unknown, fallback: string): ActionResult {
  if (error instanceof CarrierError) return { ok: false, error: error.message };
  console.error("[orders action] failed:", error instanceof Error ? error.message : error);
  return { ok: false, error: fallback };
}

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

/** The merchant's own record that the parcel was given to the courier. */
export async function handoverOrderAction(orderId: string): Promise<ActionResult> {
  try {
    const session = await requireUserForAction(CONSOLE_ROLES);
    await recordHandover(session, orderId);
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error, "The handover could not be recorded.");
  }
}

const STEPS: CarrierStep[] = ["in_transit", "out_for_delivery", "delivered", "exception"];
const METHODS: ProofOfDelivery["method"][] = ["signature", "handed_to_resident", "safe_place", "photo"];

/** Demo only: make the simulated courier report a tracking event. */
export async function simulateCarrierAction(
  orderId: string,
  step: CarrierStep,
  delivery: { method?: string; signedBy?: string; note?: string } = {},
): Promise<ActionResult> {
  try {
    const session = await requireUserForAction(CONSOLE_ROLES);
    if (!env.demoMode) return { ok: false, error: "The courier simulator is only available in demo mode." };
    if (!STEPS.includes(step)) return { ok: false, error: "Unknown courier event." };

    const method = METHODS.includes(delivery.method as ProofOfDelivery["method"])
      ? (delivery.method as ProofOfDelivery["method"])
      : undefined;
    await simulateCarrierEvent(session, orderId, step, {
      method,
      signedBy: delivery.signedBy,
      note: delivery.note,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error, "The courier event could not be recorded.");
  }
}
