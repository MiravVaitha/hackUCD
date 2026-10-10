import type { BadgeTone } from "@/components/ui/badge";
import type { FulfilmentStatus, PaymentStatus } from "@/db/schema";

/** Display wording for statuses, shared by pages, PDFs and the AI evidence bundle. */
export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "Awaiting payment", tone: "neutral" },
  paid: { label: "Paid", tone: "seal" },
  failed: { label: "Not paid", tone: "neutral" },
  partially_refunded: { label: "Partly refunded", tone: "amber" },
  refunded: { label: "Refunded", tone: "amber" },
  disputed: { label: "Disputed", tone: "signal" },
};

export const FULFILMENT_STATUS: Record<FulfilmentStatus, { label: string; tone: BadgeTone }> = {
  unfulfilled: { label: "To pack", tone: "amber" },
  packing: { label: "Being packed", tone: "transit" },
  packed: { label: "Packed", tone: "transit" },
  handed_to_carrier: { label: "Handed to carrier", tone: "transit" },
  in_transit: { label: "In transit", tone: "transit" },
  out_for_delivery: { label: "Out for delivery", tone: "transit" },
  delivered: { label: "Delivered", tone: "seal" },
  exception: { label: "Delivery problem", tone: "signal" },
};

/** Plain names for where a ledger fact came from. */
const SOURCE_LABELS: Record<string, string> = {
  stripe: "Stripe",
  demo_store: "Voltbox demo store",
  seed: "Seeded demo history",
  shopify: "Shopify",
  packing_station: "Packing station",
  "carrier:demo": "SwiftParcel demo courier",
  web_form: "Customer help form",
  merchant_app: "Merchant app",
  ai: "AI assistant",
  proofshield: "Verity",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

/** Dispute reasons as Stripe reports them, in plain words. */
const DISPUTE_REASONS: Record<string, string> = {
  product_not_received: "Product not received",
  fraudulent: "Fraudulent",
  product_unacceptable: "Product unacceptable",
  credit_not_processed: "Credit not processed",
  duplicate: "Duplicate charge",
  subscription_canceled: "Subscription cancelled",
  unrecognized: "Unrecognised charge",
  general: "General",
  noncompliant: "Non-compliant",
};

export function disputeReasonLabel(reason: string): string {
  return DISPUTE_REASONS[reason] ?? reason.replace(/_/g, " ");
}

/** Stripe dispute status in words, with the tone to show it in. */
export function disputeStatusLabel(
  stripeStatus: string,
  outcome: string | null,
): { label: string; tone: BadgeTone } {
  if (outcome === "won") return { label: "Won", tone: "seal" };
  if (outcome === "lost") return { label: "Lost", tone: "signal" };
  switch (stripeStatus) {
    case "needs_response":
      return { label: "Needs response", tone: "signal" };
    case "warning_needs_response":
      return { label: "Inquiry: needs response", tone: "amber" };
    case "under_review":
      return { label: "Under review by the bank", tone: "transit" };
    case "warning_under_review":
      return { label: "Inquiry under review", tone: "transit" };
    case "warning_closed":
      return { label: "Inquiry closed", tone: "neutral" };
    case "prevented":
      return { label: "Prevented", tone: "seal" };
    case "won":
      return { label: "Won", tone: "seal" };
    case "lost":
      return { label: "Lost", tone: "signal" };
    default:
      return { label: stripeStatus.replace(/_/g, " "), tone: "neutral" };
  }
}
