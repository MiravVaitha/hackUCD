import type { LifecycleStage } from "@/lib/ledger/types";

/** The order lifecycle ProofShield records, in the order it happens. */
export const LIFECYCLE_STEPS: { key: LifecycleStage | "resolution_or_chargeback"; label: string }[] = [
  { key: "checkout", label: "Checkout" },
  { key: "payment", label: "Payment" },
  { key: "packing", label: "Packing" },
  { key: "dispatch", label: "Dispatch" },
  { key: "delivery", label: "Delivery" },
  { key: "complaint", label: "Complaint" },
  { key: "resolution_or_chargeback", label: "Resolution or chargeback" },
  { key: "outcome", label: "Outcome" },
];
