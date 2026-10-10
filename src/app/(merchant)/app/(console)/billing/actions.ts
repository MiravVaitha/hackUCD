"use server";
import { revalidatePath } from "next/cache";
import type { FormResult } from "@/components/ui/action-form";
import { requireUserForAction } from "@/lib/auth/guards";
import { createSubscriptionCheckout, confirmSubscriptionCheckout, cancelTestSubscription } from "@/lib/stripe/billing";
import { formFailure, formText, InputError } from "@/lib/forms";
export async function cancelSubscription(_state: FormResult, data: FormData): Promise<FormResult> {
  try {
    const session = await requireUserForAction(["owner"]);
    if (data.get("confirm") !== "on") throw new InputError("Confirm cancellation first. Your free workspace remains available.");
    await cancelTestSubscription(session);
    revalidatePath("/account"); revalidatePath("/app", "layout");
    return { success: "Test Premium cancelled. Your workspace is now on the Free plan." };
  } catch (error) { return formFailure(error); }
}
export async function startSubscription(): Promise<FormResult> {
  try { const session = await requireUserForAction(["owner"], true); return { href: await createSubscriptionCheckout(session) }; }
  catch (error) { return formFailure(error); }
}
export async function verifySubscription(_state: FormResult, data: FormData): Promise<FormResult> {
  try {
    const session = await requireUserForAction(["owner"], true);
    const paid = await confirmSubscriptionCheckout(formText(data, "sessionId", 250), session.merchant.id);
    revalidatePath("/account");
    return paid ? { success: "Your test payment is confirmed. Account shows your current Premium status and transaction.", href: "/account" } : { error: "Checkout has not completed yet." };
  } catch (error) { return formFailure(error); }
}
