/**
 * Catalogue of ledger event types. Every fact attached to an order is one of
 * these, which keeps the timeline, the AI evidence bundle and the PDF reports
 * reading from a single vocabulary.
 */
export const LEDGER_EVENT_TYPES = {
  "order.placed": { label: "Order placed", stage: "checkout" },
  "payment.succeeded": { label: "Payment succeeded", stage: "payment" },
  "payment.failed": { label: "Payment failed", stage: "payment" },
  "payment.early_fraud_warning": { label: "Early fraud warning", stage: "chargeback" },

  "packing.started": { label: "Packing started", stage: "packing" },
  "packing.item_verified": { label: "Item scanned and verified", stage: "packing" },
  "packing.mismatch": { label: "Packing mismatch", stage: "packing" },
  "packing.override": { label: "Packing override", stage: "packing" },
  "packing.contents_photo": { label: "Photo of parcel contents", stage: "packing" },
  "packing.label_verified": { label: "Shipping label verified", stage: "packing" },
  "packing.label_photo": { label: "Photo of labelled parcel", stage: "packing" },
  "packing.completed": { label: "Packing completed", stage: "packing" },

  "delivery.email_imported": { label: "Delivery email imported (unverified)", stage: "delivery" },
  "shipment.label_created": { label: "Shipping label created", stage: "dispatch" },
  "shipment.handed_to_carrier": { label: "Handed to carrier", stage: "dispatch" },
  "shipment.in_transit": { label: "In transit", stage: "dispatch" },
  "shipment.out_for_delivery": { label: "Out for delivery", stage: "delivery" },
  "shipment.delivered": { label: "Delivered", stage: "delivery" },
  "shipment.exception": { label: "Delivery exception", stage: "delivery" },

  "complaint.received": { label: "Complaint received", stage: "complaint" },
  "complaint.investigated": { label: "Complaint investigated", stage: "complaint" },
  "complaint.reply_sent": { label: "Reply sent to customer", stage: "complaint" },
  "complaint.customer_replied": { label: "Customer replied", stage: "complaint" },
  "complaint.resolved": { label: "Complaint resolved", stage: "resolution" },
  "refund.issued": { label: "Refund issued", stage: "resolution" },
  "replacement.sent": { label: "Replacement sent", stage: "resolution" },

  "dispute.opened": { label: "Chargeback opened", stage: "chargeback" },
  "dispute.evidence_prepared": { label: "Dispute evidence prepared", stage: "chargeback" },
  "dispute.submitted": { label: "Dispute response submitted", stage: "chargeback" },
  "dispute.updated": { label: "Dispute updated", stage: "chargeback" },
  "dispute.funds_withdrawn": { label: "Disputed funds withdrawn", stage: "chargeback" },
  "dispute.funds_reinstated": { label: "Disputed funds reinstated", stage: "outcome" },
  "dispute.closed": { label: "Chargeback closed", stage: "outcome" },
} as const;

export type LedgerEventType = keyof typeof LEDGER_EVENT_TYPES;

export type LifecycleStage =
  | "checkout"
  | "payment"
  | "packing"
  | "dispatch"
  | "delivery"
  | "complaint"
  | "resolution"
  | "chargeback"
  | "outcome";

export function ledgerLabel(type: string): string {
  const known = LEDGER_EVENT_TYPES[type as LedgerEventType];
  return known ? known.label : type;
}

export function ledgerStage(type: string): LifecycleStage | null {
  const known = LEDGER_EVENT_TYPES[type as LedgerEventType];
  return known ? known.stage : null;
}

/** How the AI and the UI refer to a ledger event: E1, E2, ... */
export function evidenceId(seq: number): string {
  return `E${seq}`;
}

export function parseEvidenceId(id: string): number | null {
  const match = /^E(\d+)$/.exec(id.trim());
  return match ? Number(match[1]) : null;
}
