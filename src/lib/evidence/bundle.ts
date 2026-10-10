import type { Complaint, ComplaintMessage, Dispute, Merchant } from "@/db/schema";
import { evidenceId, ledgerLabel } from "@/lib/ledger/types";
import type { CustomerHistory } from "@/lib/orders/history";
import {
  disputeReasonLabel,
  FULFILMENT_STATUS,
  PAYMENT_STATUS,
  sourceLabel,
} from "@/lib/orders/labels";
import type { OrderRecord } from "@/lib/orders/queries";
import { DISPLAY_TIME_ZONE, formatAddress, formatDateTime, formatMoney } from "@/lib/utils";

/**
 * The evidence an AI run is allowed to rely on, as text, with an ID on every
 * item. The model must cite these IDs, and the grounding check rejects any ID
 * that is not in `ids`. Nothing outside this bundle is shown to the model.
 */
export type EvidenceBundle = {
  text: string;
  /** Every citable ID: ledger entries (E1…), customer messages (M1…), policies (POL-…). */
  ids: string[];
  /** Ledger sequence numbers included, for linking citations back to the timeline. */
  ledgerSeqs: number[];
};

export const POLICY_IDS = { refund: "POL-REFUND", shipping: "POL-SHIPPING" } as const;

const MAX_DETAIL_CHARS = 900;

/** Payload keys that add nothing for a reader: internal IDs and bulky duplicates. */
const HIDDEN_PAYLOAD_KEYS = new Set(["packingSessionId", "fileId", "contentsPhotoFileId", "labelPhotoFileId"]);

function compactDetails(payload: Record<string, unknown>): string {
  const visible = Object.fromEntries(Object.entries(payload).filter(([key]) => !HIDDEN_PAYLOAD_KEYS.has(key)));
  if (Object.keys(visible).length === 0) return "";
  const json = JSON.stringify(visible);
  return json.length > MAX_DETAIL_CHARS ? json.slice(0, MAX_DETAIL_CHARS) + "…(truncated)" : json;
}

export function buildEvidenceBundle(input: {
  merchant: Merchant;
  record: OrderRecord;
  history: CustomerHistory;
  complaint?: Complaint | null;
  messages?: ComplaintMessage[];
  dispute?: Dispute | null;
  now?: Date;
}): EvidenceBundle {
  const { merchant, record, history } = input;
  const { order, items, events } = record;
  const now = input.now ?? new Date();
  const ids: string[] = [];
  const lines: string[] = [];

  lines.push(
    `ORDER ${order.number} from ${merchant.name}. All times are ${DISPLAY_TIME_ZONE} local time. ` +
      `The current time is ${formatDateTime(now, true)}.`,
  );
  lines.push(`Customer: ${order.customerName ?? "not recorded"} <${order.customerEmail ?? "no email recorded"}>.`);
  lines.push(
    history.earlierOrders === 0
      ? "Customer history: first order from this email address."
      : `Customer history: ${history.earlierOrders} earlier order(s) from this email address, ` +
          `${history.earlierOrdersDelivered} delivered, ${history.earlierOrdersDisputed} disputed.`,
  );
  lines.push(`Shipping address: ${formatAddress(order.shippingAddress).join(", ") || "not recorded"}.`);
  lines.push(`Billing address: ${formatAddress(order.billingAddress).join(", ") || "not recorded"}.`);
  lines.push(
    "Items ordered: " +
      items
        .map(
          (item) =>
            `${item.quantity} x ${item.name} (SKU ${item.sku}, barcode ${item.barcode}, ` +
            `${formatMoney(item.unitPriceMinor, order.currency)} each)`,
        )
        .join("; ") +
      ".",
  );
  lines.push(
    `Totals: subtotal ${formatMoney(order.subtotalMinor, order.currency)}, delivery ` +
      `${formatMoney(order.shippingMinor, order.currency)}, total ${formatMoney(order.totalMinor, order.currency)}.`,
  );
  lines.push(
    `Current status: payment "${PAYMENT_STATUS[order.paymentStatus]?.label ?? order.paymentStatus}", ` +
      `fulfilment "${FULFILMENT_STATUS[order.fulfilmentStatus]?.label ?? order.fulfilmentStatus}".`,
  );
  if (order.simulated) {
    lines.push("This order is seeded demo history. Its entries are flagged [simulated].");
  }

  lines.push("");
  lines.push("LEDGER: every fact recorded about this order, oldest first. Cite entries by their ID in brackets.");
  const ledgerSeqs: number[] = [];
  for (const event of events) {
    const id = evidenceId(event.seq);
    ids.push(id);
    ledgerSeqs.push(event.seq);
    const flags = [
      event.simulated ? "simulated" : null,
      event.attachments.length > 0
        ? `${event.attachments.length} file(s) attached, sha256 ${event.attachments.map((a) => a.sha256.slice(0, 12)).join(", ")}`
        : null,
    ].filter(Boolean);
    lines.push(
      `[${id}] ${formatDateTime(event.occurredAt, true)} | ${ledgerLabel(event.type)} | source: ` +
        `${sourceLabel(event.source)}${event.sourceRef ? ` ${event.sourceRef}` : ""}` +
        (event.actorType === "user" && event.actorLabel ? ` | recorded by ${event.actorLabel}` : "") +
        (flags.length ? ` | ${flags.join("; ")}` : ""),
    );
    lines.push(`     ${event.summary}`);
    const details = compactDetails(event.payload ?? {});
    if (details) lines.push(`     details: ${details}`);
  }
  if (events.length === 0) lines.push("(no entries)");

  lines.push("");
  lines.push("MERCHANT POLICIES");
  if (merchant.settings.refundPolicy) {
    ids.push(POLICY_IDS.refund);
    lines.push(`[${POLICY_IDS.refund}] Refund policy: ${merchant.settings.refundPolicy}`);
  }
  if (merchant.settings.shippingPolicy) {
    ids.push(POLICY_IDS.shipping);
    lines.push(`[${POLICY_IDS.shipping}] Shipping policy: ${merchant.settings.shippingPolicy}`);
  }

  if (input.complaint) {
    const complaint = input.complaint;
    lines.push("");
    lines.push(
      `COMPLAINT ${complaint.number}, received ${formatDateTime(complaint.createdAt, true)} by ` +
        `${complaint.channel.replace(/_/g, " ")}. Subject: "${complaint.subject}".`,
    );
    lines.push(
      "MESSAGES: what the customer and the merchant have written. A customer message is the customer's " +
        "account of events, not a verified fact.",
    );
    const thread = (input.messages ?? [])
      .filter((message) => message.direction !== "internal")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    thread.forEach((message, index) => {
      const id = `M${index + 1}`;
      ids.push(id);
      const who = message.direction === "inbound" ? "customer" : `merchant (${message.authorLabel})`;
      lines.push(`[${id}] ${formatDateTime(message.createdAt, true)} | from ${who}:`);
      lines.push(`     "${message.body.replace(/\s+/g, " ").trim()}"`);
    });
    if (thread.length === 0) {
      ids.push("M1");
      lines.push(`[M1] ${formatDateTime(complaint.createdAt, true)} | from customer:`);
      lines.push(`     "${complaint.body.replace(/\s+/g, " ").trim()}"`);
    }
  }

  if (input.dispute) {
    const dispute = input.dispute;
    lines.push("");
    lines.push(
      `CHARGEBACK ${dispute.stripeDisputeId}: the cardholder's bank reports the reason ` +
        `"${disputeReasonLabel(dispute.reason)}" (${dispute.reason}) for ` +
        `${formatMoney(dispute.amountMinor, dispute.currency)}` +
        (dispute.cardBrand ? ` on a ${dispute.cardBrand} card` : "") +
        (dispute.networkReasonCode ? `, network reason code ${dispute.networkReasonCode}` : "") +
        (dispute.evidenceDueBy ? `. Evidence is due by ${formatDateTime(dispute.evidenceDueBy)}` : "") +
        (dispute.isInquiry ? ". This is an inquiry, not yet a formal chargeback." : "."),
    );
  }

  return { text: lines.join("\n"), ids, ledgerSeqs };
}
