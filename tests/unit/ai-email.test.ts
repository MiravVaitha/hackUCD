import { describe, expect, it } from "vitest";
import type { SessionContext } from "@/lib/auth/session";
import { parseEmailWithAi } from "@/lib/delivery/ai-email";
const context = { merchant: { settings: { billing: { subscriptionId: "sub_test", status: "active" } } } } as SessionContext;
const raw = "DHL: Order VB-1001. Tracking: ABC123456. Your parcel was delivered on 9 October 2026.";
const extraction = { carrier: "DHL", orderNumber: "VB-1001", tracking: "ABC123456", status: "delivered", reportedDate: "9 October 2026", statusQuote: "Your parcel was delivered on 9 October 2026." };
const complete = (data: unknown) => async () => ({ data, model: "test", tokensIn: 1, tokensOut: 1, costUsd: 0, latencyMs: 1 });
describe("OpenRouter email extraction", () => {
  it("requires Premium before calling a model", async () => {
    await expect(parseEmailWithAi({ merchant: { settings: {} } } as SessionContext, raw, complete(extraction))).rejects.toThrow("Premium");
  });
  it("accepts extracted fields anchored to the original email", async () => {
    expect((await parseEmailWithAi(context, raw, complete(extraction))).extraction).toEqual(extraction);
  });
  it("rejects fabricated identifiers and unsupported delivery status", async () => {
    await expect(parseEmailWithAi(context, raw, complete({ ...extraction, tracking: "invented123" }))).rejects.toThrow("not found");
    await expect(parseEmailWithAi(context, raw, complete({ ...extraction, statusQuote: "" }))).rejects.toThrow("source excerpt");
  });
});
