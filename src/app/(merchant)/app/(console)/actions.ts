"use server";
import { revalidatePath } from "next/cache";
import type { FormResult } from "@/components/ui/action-form";
import { CONSOLE_ROLES, requireUserForAction } from "@/lib/auth/guards";
import { syncDemoData } from "@/lib/demo/sync";
import { formFailure } from "@/lib/forms";
export async function syncDemoAction(): Promise<FormResult> {
  try {
    const session = await requireUserForAction(CONSOLE_ROLES);
    const result = await syncDemoData(session);
    revalidatePath("/app", "layout");
    return { success: `Six simulated sources synced. ${result.added} new orders; existing records were preserved.` };
  } catch (error) { return formFailure(error); }
}
