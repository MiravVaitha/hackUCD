"use server";
import { revalidatePath } from "next/cache";
import type { FormResult } from "@/components/ui/action-form";
import { CONSOLE_ROLES, requireUserForAction } from "@/lib/auth/guards";
import { formFailure, InputError } from "@/lib/forms";
import { importDeliveryEmail } from "@/lib/delivery/import-email";
import { parseEmailWithAi } from "@/lib/delivery/ai-email";

export async function extractEmailWithAi(raw: string) {
  try {
    const session = await requireUserForAction(CONSOLE_ROLES);
    return { result: await parseEmailWithAi(session, raw) };
  } catch (error) { return { error: formFailure(error).error }; }
}

export async function saveDeliveryEmail(_state: FormResult, data: FormData): Promise<FormResult> {
  try {
    const session = await requireUserForAction(CONSOLE_ROLES);
    if (data.get("reviewed") !== "on") throw new InputError("Review the extracted fields and confirm before saving.");
    const order = await importDeliveryEmail(session, Object.fromEntries(data));
    revalidatePath("/app", "layout");
    return { href: `/app/orders/${order.number}` };
  } catch (error) { return formFailure(error); }
}
