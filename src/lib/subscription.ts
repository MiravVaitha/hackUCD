import type { Merchant } from "@/db/schema";
export function hasSubscription(merchant: Pick<Merchant, "settings">): boolean {
  const billing = merchant.settings.billing;
  return Boolean(billing?.subscriptionId && (billing.status === "active" || billing.status === "trialing"));
}
