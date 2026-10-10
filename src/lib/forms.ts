import { z } from "zod";

export function formText(data: FormData, key: string, max = 5000): string {
  const value = data.get(key);
  if (typeof value !== "string" || value.length > max) throw new InputError(`Check the ${key} field.`);
  return value.trim();
}
export function formId(data: FormData, key: string): string {
  const value = formText(data, key, 50);
  if (!z.uuid().safeParse(value).success) throw new InputError("That record reference is invalid.");
  return value;
}
export class InputError extends Error {}
export function formFailure(error: unknown): { error: string } {
  // Only known domain errors are safe to expose. Database/provider internals stay server-side.
  if (error instanceof InputError || (error instanceof Error && ["ComplaintError", "InvestigationError", "DisputeError", "RefundError", "AiError", "ForbiddenError", "NotSignedInError", "SubscriptionRequiredError"].includes(error.name))) {
    return { error: error.message };
  }
  console.error("[form] operation failed", error instanceof Error ? error.name : "Unknown error");
  return { error: "This action could not be completed. Please try again." };
}
