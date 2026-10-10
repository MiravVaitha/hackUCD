"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import type { FormResult } from "@/components/ui/action-form";
import { db } from "@/db/client";
import { aiRuns, orders, type ComplaintResolution } from "@/db/schema";
import { CONSOLE_ROLES, requireUserForAction, requirePremium } from "@/lib/auth/guards";
import { createComplaint, getComplaintThreadById, linkComplaintToOrder, sendReply, addInternalNote, resolveComplaint, recordReplacement } from "@/lib/complaints/service";
import { runInvestigation } from "@/lib/ai/investigate";
import { investigationSchema } from "@/lib/ai/schemas";
import { formFailure, formId, formText, InputError } from "@/lib/forms";
import { refundOrder } from "@/lib/stripe/refunds";

export async function createManualComplaint(_state: FormResult, data: FormData): Promise<FormResult> {
  try {
    const session = await requireUserForAction(CONSOLE_ROLES);
    const number = formText(data, "orderNumber", 40).toUpperCase();
    const [order] = number ? await db.select().from(orders).where(and(eq(orders.merchantId, session.merchant.id), eq(orders.number, number))).limit(1) : [];
    if (number && !order) throw new InputError("That order could not be found.");
    const complaint = await createComplaint({ merchantId: session.merchant.id, orderId: order?.id ?? null, channel: "manual", body: formText(data, "message"), customerEmail: formText(data, "email", 200), customerName: formText(data, "name", 120), createdByUserId: session.user.id });
    revalidatePath("/app", "layout");
    return { href: `/app/complaints/${complaint.number}` };
  } catch (error) { return formFailure(error); }
}

export async function complaintAction(_state: FormResult, data: FormData): Promise<FormResult> {
  try {
    const session = await requireUserForAction(CONSOLE_ROLES);
    const id = formId(data, "id");
    const thread = await getComplaintThreadById(session.merchant.id, id);
    if (!thread) throw new InputError("That complaint could not be found.");
    const operation = formText(data, "operation", 30);
    let success = "Saved.";
    switch (operation) {
      case "link": await linkComplaintToOrder(session, id, formText(data, "orderNumber", 40)); break;
      case "investigate": requirePremium(session); await runInvestigation(session, id); success = "Investigation ready. Review the evidence and draft below."; break;
      case "reply": {
        let aiDraft: string | undefined;
        let aiRunId: string | undefined;
        if (data.get("aiRunId")) {
          aiRunId = formId(data, "aiRunId");
          const [run] = await db.select().from(aiRuns).where(and(eq(aiRuns.id, aiRunId), eq(aiRuns.merchantId, session.merchant.id), eq(aiRuns.subjectId, id), eq(aiRuns.kind, "investigation"), eq(aiRuns.status, "succeeded"))).limit(1);
          const parsed = investigationSchema.safeParse(run?.output);
          if (!parsed.success) throw new InputError("This AI draft is no longer available. Refresh the page.");
          aiDraft = parsed.data.customer_reply.body;
        }
        await sendReply(session, id, { body: formText(data, "message"), aiRunId, aiDraft });
        success = "Reply published to the customer's private case page."; break;
      }
      case "note": await addInternalNote(session, id, formText(data, "message")); success = "Internal note saved. The customer cannot see it."; break;
      case "resolve": await resolveComplaint(session, id, { resolution: formText(data, "resolution", 40) as ComplaintResolution, note: formText(data, "note", 1000) }); success = "Case resolved."; break;
      case "replacement": await recordReplacement(session, id, formText(data, "message", 500)); success = "Replacement arrangement recorded."; break;
      case "refund": {
        if (!thread.order || data.get("confirm") !== "on") throw new InputError("Confirm the refund for the linked order first.");
        const amount = formText(data, "amount", 20);
        if (amount && !/^\d+(\.\d{1,2})?$/.test(amount)) throw new InputError("Enter a valid amount with up to two decimal places.");
        await refundOrder(session, thread.order.id, { amountMinor: amount ? Math.round(Number(amount) * 100) : undefined, note: formText(data, "note", 300), complaintNumber: thread.complaint.number });
        success = "Refund recorded. You can now reply and close the case."; break;
      }
      default: throw new InputError("Unknown action.");
    }
    revalidatePath("/app", "layout");
    revalidatePath(`/store/help/${thread.complaint.publicToken}`);
    return { success };
  } catch (error) { return formFailure(error); }
}
