import type { Complaint, Dispute, LedgerEvent, Order } from "@/db/schema";

export type LifecycleState = "done" | "active" | "problem" | "idle";

export type LifecycleStep = {
  key: string;
  label: string;
  state: LifecycleState;
  /** Short status under the step name. */
  detail: string;
};

/**
 * Where an order stands across the whole lifecycle ProofShield records:
 * checkout, payment, packing, dispatch, delivery, complaint, resolution or
 * chargeback, outcome. Derived from the ledger, not stored.
 */
export function buildLifecycle(input: {
  order: Order;
  events: Pick<LedgerEvent, "type">[];
  complaints: Pick<Complaint, "status" | "resolution">[];
  disputes: Pick<Dispute, "stripeStatus" | "outcome" | "isInquiry">[];
}): LifecycleStep[] {
  const { order, events, complaints, disputes } = input;
  const has = (type: string) => events.some((event) => event.type === type);

  const packingStarted = has("packing.started");
  const packingDone = has("packing.completed");
  const handedOver = has("shipment.handed_to_carrier");
  const delivered = has("shipment.delivered");
  const deliveryProblem = has("shipment.exception") && !delivered;

  const openComplaint = complaints.some((c) => c.status !== "resolved" && c.status !== "escalated");
  const anyComplaint = complaints.length > 0;
  const resolvedComplaint = complaints.some((c) => c.status === "resolved");

  const dispute = disputes[disputes.length - 1] ?? null;
  const disputeOpen = dispute !== null && dispute.outcome === null;

  const steps: LifecycleStep[] = [
    {
      key: "checkout",
      label: "Checkout",
      state: has("order.placed") ? "done" : "idle",
      detail: has("order.placed") ? "Order placed" : "Not placed",
    },
    {
      key: "payment",
      label: "Payment",
      state: has("payment.succeeded") ? "done" : order.paymentStatus === "failed" ? "problem" : "idle",
      detail: has("payment.succeeded")
        ? order.simulated
          ? "Paid (simulated)"
          : "Paid"
        : order.paymentStatus === "failed"
          ? "Not paid"
          : "Awaiting payment",
    },
    {
      key: "packing",
      label: "Packing",
      state: packingDone ? "done" : packingStarted ? "active" : "idle",
      detail: packingDone ? "Scanned and photographed" : packingStarted ? "In progress" : "Not packed",
    },
    {
      key: "dispatch",
      label: "Dispatch",
      state: handedOver ? "done" : "idle",
      detail: handedOver ? "Handed to carrier" : packingDone ? "Awaiting collection" : "Not dispatched",
    },
    {
      key: "delivery",
      label: "Delivery",
      state: delivered ? "done" : deliveryProblem ? "problem" : handedOver ? "active" : "idle",
      detail: delivered ? "Delivered" : deliveryProblem ? "Delivery problem" : handedOver ? "In transit" : "Not delivered",
    },
    {
      key: "complaint",
      label: "Complaint",
      state: openComplaint ? "active" : anyComplaint ? "done" : "idle",
      detail: openComplaint ? "Open" : anyComplaint ? "Handled" : "None",
    },
    {
      key: "resolution",
      label: dispute ? "Chargeback" : "Resolution",
      state: dispute ? (disputeOpen ? "problem" : "done") : resolvedComplaint ? "done" : "idle",
      detail: dispute
        ? dispute.isInquiry
          ? "Bank inquiry"
          : "Filed with the bank"
        : resolvedComplaint
          ? "Resolved with the customer"
          : "None",
    },
    {
      key: "outcome",
      label: "Outcome",
      state: dispute
        ? dispute.outcome === "won"
          ? "done"
          : dispute.outcome === "lost"
            ? "problem"
            : dispute.stripeStatus.includes("under_review")
              ? "active"
              : "idle"
        : resolvedComplaint && !openComplaint
          ? "done"
          : "idle",
      detail: dispute
        ? dispute.outcome === "won"
          ? "Dispute won"
          : dispute.outcome === "lost"
            ? "Dispute lost"
            : dispute.outcome === "closed"
              ? "Closed"
              : dispute.stripeStatus.includes("under_review")
                ? "With the bank"
                : "Awaiting response"
        : resolvedComplaint && !openComplaint
          ? "No dispute filed"
          : anyComplaint
            ? "Open"
            : "Nothing raised",
    },
  ];

  return steps;
}
