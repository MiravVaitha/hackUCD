import type { ComplaintMessage, EvidenceFile, LedgerEvent } from "@/db/schema";
import { evidenceStore } from "@/lib/evidence/store";
import type { LedgerVerification } from "@/lib/ledger/verify";
import { evidenceId, ledgerLabel } from "@/lib/ledger/types";
import type { CustomerHistory } from "@/lib/orders/history";
import {
  disputeReasonLabel,
  disputeStatusLabel,
  FULFILMENT_STATUS,
  PAYMENT_STATUS,
  sourceLabel,
} from "@/lib/orders/labels";
import type { OrderRecord } from "@/lib/orders/queries";
import { orderSourceLabel } from "@/lib/orders/source";
import { describeCheck, describeThreeDSecure } from "@/lib/stripe/payments";
import { formatAddress, formatDateTime, formatDuration, formatMoney, sentenceCase } from "@/lib/utils";
import type { PdfBuilder, PdfImageInput } from "./kit";

/**
 * Document sections shared by the order evidence report and the dispute
 * packets. Each one writes facts straight from stored records, so the PDF can
 * never say something the ledger does not.
 */

const SIMULATED = " [simulated]";

export async function loadImages(
  files: (EvidenceFile | undefined)[],
  captions: string[],
): Promise<PdfImageInput[]> {
  const images: PdfImageInput[] = [];
  for (const [index, file] of files.entries()) {
    if (!file || !file.mime.startsWith("image/")) continue;
    const bytes = await evidenceStore.get(file.id);
    if (!bytes) continue;
    images.push({
      bytes: new Uint8Array(bytes),
      mime: file.mime,
      caption: `${captions[index]}. Stored ${formatDateTime(file.createdAt, true)}. SHA-256 ${file.sha256.slice(0, 24)}...`,
    });
  }
  return images;
}

export function orderSummarySection(pdf: PdfBuilder, record: OrderRecord, history?: CustomerHistory): void {
  const { order, items } = record;
  pdf.heading("Order");
  pdf.keyValues([
    ["Order number", order.number],
    ["Placed", formatDateTime(order.placedAt, true)],
    ["Sales channel", orderSourceLabel(order.source) + (order.simulated ? SIMULATED : "")],
    ["Customer", order.customerName],
    ["Email", order.customerEmail],
    ["Shipping address", formatAddress(order.shippingAddress).join(", ")],
    ["Billing address", formatAddress(order.billingAddress).join(", ")],
    ["Payment status", PAYMENT_STATUS[order.paymentStatus]?.label ?? order.paymentStatus],
    ["Fulfilment status", FULFILMENT_STATUS[order.fulfilmentStatus]?.label ?? order.fulfilmentStatus],
  ]);
  if (history) {
    pdf.keyValues([
      [
        "Customer history",
        history.earlierOrders === 0
          ? "First order from this email address."
          : `${history.earlierOrders} earlier order(s) from this email address; ` +
            `${history.earlierOrdersDelivered} delivered, ${history.earlierOrdersDisputed} disputed.`,
      ],
    ]);
  }

  pdf.table(
    ["Item", "SKU", "Barcode", "Qty", "Unit price"],
    items.map((item) => [
      item.name,
      item.sku,
      item.barcode,
      String(item.quantity),
      formatMoney(item.unitPriceMinor, order.currency),
    ]),
    [0.36, 0.22, 0.2, 0.08, 0.14],
  );
  pdf.keyValues([
    ["Subtotal", formatMoney(order.subtotalMinor, order.currency)],
    ["Delivery", formatMoney(order.shippingMinor, order.currency)],
    ["Order total", formatMoney(order.totalMinor, order.currency)],
  ]);
}

export function paymentSection(pdf: PdfBuilder, record: OrderRecord): void {
  const { payments, refunds } = record;
  pdf.heading("Payment");
  const payment = payments[0];
  if (!payment) {
    pdf.paragraph("No payment has been recorded for this order.", { muted: true });
    return;
  }
  pdf.keyValues([
    ["Amount", formatMoney(payment.amountMinor, payment.currency)],
    ["Paid", formatDateTime(payment.paidAt, true)],
    ["Processor", payment.provider === "stripe" ? "Stripe" : "Simulated payment" + SIMULATED],
    [
      "Payment method",
      payment.cardBrand
        ? `${payment.cardBrand.toUpperCase()} ending ${payment.cardLast4 ?? "----"}` +
          (payment.cardFunding ? `, ${payment.cardFunding}` : "") +
          (payment.cardCountry ? `, issued in ${payment.cardCountry}` : "")
        : sentenceCase(payment.paymentMethodType ?? "unknown"),
    ],
    ["CVC check", sentenceCase(describeCheck(payment.cvcCheck))],
    ["Postcode check", sentenceCase(describeCheck(payment.postalCodeCheck))],
    ["Address line check", sentenceCase(describeCheck(payment.addressLine1Check))],
    ["3D Secure", sentenceCase(describeThreeDSecure(payment.threeDSecure?.result))],
    [
      "Processor risk level",
      payment.riskLevel
        ? sentenceCase(payment.riskLevel) + (payment.riskScore !== null ? ` (score ${payment.riskScore})` : "")
        : null,
    ],
    ["Payment reference", payment.paymentIntentId],
    ["Charge reference", payment.chargeId],
  ]);
  if (refunds.length > 0) {
    pdf.subheading("Refunds");
    pdf.table(
      ["Date", "Amount", "Reason", "Reference"],
      refunds.map((refund) => [
        formatDateTime(refund.createdAt),
        formatMoney(refund.amountMinor, refund.currency),
        refund.reason ? sentenceCase(refund.reason) : "",
        refund.simulated ? "Simulated" : (refund.stripeRefundId ?? ""),
      ]),
      [0.26, 0.16, 0.28, 0.3],
    );
  }
}

export async function packingSection(pdf: PdfBuilder, record: OrderRecord): Promise<void> {
  const { items, packingSessions, files } = record;
  pdf.heading("Packing verification");
  const session = packingSessions[packingSessions.length - 1];
  if (!session) {
    pdf.paragraph("No packing session has been recorded for this order.", { muted: true });
    return;
  }

  const statusText: Record<string, string> = {
    completed: "Packed; every item scanned and matched to the order",
    completed_with_exceptions: "Packed with recorded exceptions",
    in_progress: "Packing in progress",
    abandoned: "Packing abandoned",
  };
  pdf.keyValues([
    ["Result", (statusText[session.status] ?? session.status) + (session.simulated ? SIMULATED : "")],
    ["Packed by", session.packerName],
    ["Station", session.stationLabel],
    ["Started", formatDateTime(session.startedAt, true)],
    ["Finished", session.completedAt ? formatDateTime(session.completedAt, true) : "Not finished"],
    ["Time taken", session.durationMs !== null ? formatDuration(session.durationMs) : null],
    ["Shipping label", session.labelVerified ? "Scanned and matched to this order" : "Not scanned"],
  ]);

  pdf.subheading("Items scanned against the order");
  pdf.table(
    ["Item", "Barcode", "Ordered", "Scanned"],
    items.map((item) => [
      item.name,
      item.barcode,
      String(item.quantity),
      String(session.itemCounts[item.id] ?? 0),
    ]),
    [0.46, 0.26, 0.14, 0.14],
  );

  if (session.exceptions.length > 0) {
    pdf.subheading("Exceptions and overrides");
    pdf.bullets(
      session.exceptions.map(
        (exception) =>
          `${sentenceCase(exception.kind)}${exception.overridden ? " (overridden by staff)" : ""}` +
          `${exception.note ? `: ${exception.note}` : ""}` +
          `${exception.code ? ` [code ${exception.code}]` : ""}`,
      ),
    );
  }

  const filesById = new Map(files.map((file) => [file.id, file]));
  const photos = await loadImages(
    [
      session.contentsPhotoFileId ? filesById.get(session.contentsPhotoFileId) : undefined,
      session.labelPhotoFileId ? filesById.get(session.labelPhotoFileId) : undefined,
    ],
    ["Parcel contents before sealing", "Sealed parcel with shipping label"],
  );
  if (photos.length > 0) {
    pdf.subheading("Photographs taken at the packing station");
    await pdf.images(photos, { perRow: 2, maxHeight: 190 });
  }

  pdf.note(
    "Scans and photographs record what was done at the packing station. They are the merchant's own records.",
  );
}

export async function deliverySection(pdf: PdfBuilder, record: OrderRecord): Promise<void> {
  const { shipment, events, files } = record;
  pdf.heading("Shipping and delivery");
  if (!shipment) {
    pdf.paragraph("No shipment has been recorded for this order.", { muted: true });
    return;
  }

  const pod = shipment.proofOfDelivery;
  pdf.keyValues([
    ["Carrier", `${shipment.carrier} ${shipment.service}` + (shipment.simulated ? SIMULATED : "")],
    ["Tracking number", shipment.trackingNumber],
    ["Ship to", formatAddress(record.order.shippingAddress).join(", ")],
    ["Label created", formatDateTime(shipment.labelCreatedAt, true)],
    [
      "Handed to carrier",
      shipment.handedToCarrierAt ? formatDateTime(shipment.handedToCarrierAt, true) : "Not yet handed over",
    ],
    ["Delivered", shipment.deliveredAt ? formatDateTime(shipment.deliveredAt, true) : "Not delivered"],
    [
      "Proof of delivery",
      pod
        ? sentenceCase(pod.method) + (pod.signedBy ? ` by ${pod.signedBy}` : "") + (pod.note ? `. ${pod.note}` : "")
        : "None recorded",
    ],
  ]);

  const tracking = events.filter((event) => event.type.startsWith("shipment."));
  if (tracking.length > 0) {
    pdf.subheading("Tracking history");
    pdf.table(
      ["Date and time", "Event", "Detail"],
      tracking.map((event) => [
        formatDateTime(event.occurredAt, true),
        ledgerLabel(event.type) + (event.simulated ? SIMULATED : ""),
        event.summary,
      ]),
      [0.26, 0.24, 0.5],
    );
  }

  if (pod?.fileId) {
    const photos = await loadImages(
      [files.find((file) => file.id === pod.fileId)],
      ["Proof of delivery from the carrier"],
    );
    if (photos.length > 0) await pdf.images(photos, { perRow: 2, maxHeight: 170 });
  }
}

export function communicationSection(
  pdf: PdfBuilder,
  record: OrderRecord,
  messages: ComplaintMessage[],
): void {
  pdf.heading("Communication with the customer");
  if (record.complaints.length === 0) {
    pdf.paragraph("The customer has not contacted the merchant about this order.", { muted: true });
    return;
  }

  for (const complaint of record.complaints) {
    pdf.subheading(`${complaint.number}: ${complaint.subject}`);
    pdf.keyValues([
      ["Received", formatDateTime(complaint.createdAt, true)],
      ["Channel", sentenceCase(complaint.channel)],
      ["From", [complaint.customerName, complaint.customerEmail].filter(Boolean).join(", ")],
      [
        "Status",
        sentenceCase(complaint.status) + (complaint.resolution ? `, ${sentenceCase(complaint.resolution)}` : ""),
      ],
    ]);

    const thread = messages
      .filter((message) => message.complaintId === complaint.id && message.direction !== "internal")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    if (thread.length === 0) {
      pdf.paragraph(`Customer wrote: "${complaint.body}"`);
    }
    for (const message of thread) {
      const who = message.direction === "inbound" ? "Customer" : "Merchant";
      pdf.paragraph(`${who} (${message.authorLabel}), ${formatDateTime(message.createdAt, true)}:`, { bold: true });
      pdf.paragraph(message.body);
    }
    if (complaint.resolutionNote) {
      pdf.paragraph(`Resolution note: ${complaint.resolutionNote}`, { muted: true });
    }
  }
}

export function disputeSection(pdf: PdfBuilder, record: OrderRecord): void {
  pdf.heading("Chargeback");
  if (record.disputes.length === 0) {
    pdf.paragraph("No dispute has been filed with the bank for this order.", { muted: true });
    return;
  }
  for (const dispute of record.disputes) {
    pdf.keyValues([
      ["Dispute reference", dispute.stripeDisputeId],
      ["Reason given", disputeReasonLabel(dispute.reason)],
      ["Amount disputed", formatMoney(dispute.amountMinor, dispute.currency)],
      ["Status", disputeStatusLabel(dispute.stripeStatus, dispute.outcome).label],
      ["Evidence due", dispute.evidenceDueBy ? formatDateTime(dispute.evidenceDueBy) : null],
      ["Closed", dispute.closedAt ? formatDateTime(dispute.closedAt) : "Not closed"],
    ]);
  }
}

export function timelineSection(pdf: PdfBuilder, events: LedgerEvent[], title = "Evidence timeline"): void {
  pdf.heading(title);
  if (events.length === 0) {
    pdf.paragraph("Nothing has been recorded for this order.", { muted: true });
    return;
  }
  pdf.table(
    ["ID", "Date and time", "Event", "Source"],
    events.map((event) => [
      evidenceId(event.seq),
      formatDateTime(event.occurredAt, true),
      `${ledgerLabel(event.type)}${event.simulated ? SIMULATED : ""}. ${event.summary}`,
      sourceLabel(event.source) + (event.sourceRef ? ` ${event.sourceRef}` : ""),
    ]),
    [0.07, 0.2, 0.48, 0.25],
  );
}

export function integritySection(
  pdf: PdfBuilder,
  record: OrderRecord,
  verification: LedgerVerification | null,
): void {
  pdf.heading("Record integrity");
  pdf.paragraph(
    "Every entry in this record is stored with a SHA-256 hash that also covers the hash of the entry before it, " +
      "and each file is stored with the SHA-256 of its contents. Changing or removing an entry or a file after " +
      "the fact breaks the chain and is detected when it is checked. This makes the record tamper-evident. " +
      "It does not make it impossible to alter.",
  );
  if (verification) {
    pdf.paragraph(
      verification.ok
        ? `Integrity check at the time this document was generated: no changes detected across ` +
            `${verification.eventCount} entries and ${verification.fileCount} files.`
        : `Integrity check at the time this document was generated: ${verification.problems.length} problem(s) found. ` +
            verification.problems.map((problem) => problem.detail).join(" "),
      { bold: true },
    );
  }
  pdf.subheading("Chain head and entry hashes");
  pdf.monoLine(`head ${record.order.ledgerHeadHash ?? "none"}`);
  for (const event of record.events) {
    pdf.monoLine(`${evidenceId(event.seq).padEnd(4)} ${event.hash}`);
  }
  if (record.files.length > 0) {
    pdf.spacer(6);
    pdf.subheading("File hashes");
    for (const file of record.files) {
      pdf.monoLine(`${file.kind.padEnd(28)} ${file.sha256}`);
    }
  }
}

export function hasSimulatedData(record: OrderRecord): boolean {
  return (
    record.order.simulated ||
    record.events.some((event) => event.simulated) ||
    record.payments.some((payment) => payment.provider === "simulated")
  );
}
