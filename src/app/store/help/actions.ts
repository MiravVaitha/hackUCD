"use server";
import { revalidatePath } from "next/cache";
import type { FormResult } from "@/components/ui/action-form";
import { addCustomerReply, createComplaintFromHelpForm } from "@/lib/complaints/service";
import { formFailure, formText, InputError } from "@/lib/forms";
import { getStoreMerchant } from "@/lib/store";

export async function createHelpCase(_state: FormResult, data: FormData): Promise<FormResult> {
  try {
    const merchant = await getStoreMerchant();
    if (!merchant) throw new InputError("The store is not ready yet.");
    const complaint = await createComplaintFromHelpForm({ merchantId: merchant.id,
      orderNumber: formText(data, "orderNumber", 40), email: formText(data, "email", 200),
      name: formText(data, "name", 120), message: formText(data, "message") });
    revalidatePath("/app", "layout");
    return { href: `/store/help/${complaint.publicToken}` };
  } catch (error) { return formFailure(error); }
}
export async function replyToHelpCase(_state: FormResult, data: FormData): Promise<FormResult> {
  try {
    const token = formText(data, "token", 60);
    if (!/^[A-Za-z0-9_-]{20,60}$/.test(token)) throw new InputError("Invalid case link.");
    await addCustomerReply(token, formText(data, "message"));
    revalidatePath(`/store/help/${token}`);
    revalidatePath("/app", "layout");
    return { success: "Your message has been added to the case." };
  } catch (error) { return formFailure(error); }
}
