"use server";
import { assessDispute } from "@/lib/disputes/assessment";
import { revalidatePath } from "next/cache";
import type { FormResult } from "@/components/ui/action-form";
import { CONSOLE_ROLES, requireUserForAction, requirePremium } from "@/lib/auth/guards";
import { compileEvidence, saveEvidenceDraft, simulateDispute, createTemplateDraft } from "@/lib/disputes/service";
import { formFailure, formId, formText, InputError } from "@/lib/forms";

export async function disputeAction(_state: FormResult, data: FormData): Promise<FormResult> {
  try {
    const session = await requireUserForAction(CONSOLE_ROLES);
    const operation = formText(data, "operation", 30);
    if (operation === "simulate") {
      const dispute = await simulateDispute(session, formId(data, "orderId"));
      revalidatePath("/app", "layout");
      return { href: `/app/disputes/${dispute.id}` };
    }
    const id = formId(data, "id");
    if (operation === "compile") { requirePremium(session); await compileEvidence(session, id); }
    else if (operation === "assess") { await assessDispute(session, id); revalidatePath("/app", "layout"); return { success: "AI assessment ready. Review the estimate and evidence gaps below." }; }
    else if (operation === "template") await createTemplateDraft(session, id);
    else if (operation === "save") await saveEvidenceDraft(session, id, formText(data, "response", 10000));
    else throw new InputError("Unknown action.");
    revalidatePath("/app", "layout");
    return { success: "Evidence pack saved. Review the response, then copy the email or download the PDF." };
  } catch (error) { return formFailure(error); }
}
