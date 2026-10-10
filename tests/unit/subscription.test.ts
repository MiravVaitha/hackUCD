import { describe, expect, it } from "vitest";
import { hasSubscription } from "@/lib/subscription";
describe("Verity subscription access", () => {
  it("does not grant Premium for unpaid and incomplete checkouts", () => {
    expect(hasSubscription({ settings: {} })).toBe(false);
    expect(hasSubscription({ settings: { billing: { status: "active" } } })).toBe(false);
    expect(hasSubscription({ settings: { billing: { subscriptionId: "sub_test", status: "incomplete" } } })).toBe(false);
  });
  it("unlocks a verified active subscription and blocks cancellation", () => {
    expect(hasSubscription({ settings: { billing: { subscriptionId: "sub_test", status: "active", testMode: true } } })).toBe(true);
    expect(hasSubscription({ settings: { billing: { subscriptionId: "sub_test", status: "canceled", testMode: true } } })).toBe(false);
  });
});
