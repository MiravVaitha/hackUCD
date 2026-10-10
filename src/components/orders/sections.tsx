import {
  Camera,
  CreditCard,
  Landmark,
  MessagesSquare,
  ScanBarcode,
  Truck,
  UserRound,
} from "lucide-react";
import Link from "next/link";

import { Badge, SimulatedBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, Fact } from "@/components/ui/card";
import { DisputeBadge } from "@/components/orders/status-badges";
import type { EvidenceFile, ScanResult } from "@/db/schema";
import type { CustomerHistory } from "@/lib/orders/history";
import { disputeReasonLabel } from "@/lib/orders/labels";
import type { OrderRecord } from "@/lib/orders/queries";
import { describeCheck, describeThreeDSecure } from "@/lib/stripe/payments";
import {
  formatAddress,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatRelative,
  sentenceCase,
  shortHash,
} from "@/lib/utils";

function Mono({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span className="font-mono text-[12px] break-all text-ink-700" title={title}>
      {children}
    </span>
  );
}

function AddressLines({ lines }: { lines: string[] }) {
  if (lines.length === 0) return <span className="text-ink-400">Not recorded</span>;
  return (
    <address className="not-italic">
      {lines.map((line, index) => (
        <span key={index} className="block">
          {line}
        </span>
      ))}
    </address>
  );
}

function checkTone(value: string | null): "seal" | "signal" | "neutral" {
  if (value === "pass") return "seal";
  if (value === "fail") return "signal";
  return "neutral";
}

// --- Customer ---------------------------------------------------------------

export function CustomerSection({ record, history }: { record: OrderRecord; history: CustomerHistory }) {
  const { order } = record;
  return (
    <Card>
      <CardHeader title="Customer" icon={<UserRound className="h-4 w-4" aria-hidden="true" />} />
      <CardBody>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Fact label="Name">{order.customerName ?? <span className="text-ink-400">Not recorded</span>}</Fact>
          <Fact label="Email">
            {order.customerEmail ? <span className="break-all">{order.customerEmail}</span> : <span className="text-ink-400">Not recorded</span>}
          </Fact>
          <Fact label="Ship to">
            <AddressLines lines={formatAddress(order.shippingAddress)} />
          </Fact>
          <Fact label="Bill to">
            <AddressLines lines={formatAddress(order.billingAddress)} />
          </Fact>
          <Fact label="Order history" className="sm:col-span-2">
            {history.earlierOrders === 0 ? (
              "First order from this email address."
            ) : (
              <>
                {history.earlierOrders} earlier order{history.earlierOrders === 1 ? "" : "s"}
                {history.firstOrderAt ? ` since ${formatDateTime(history.firstOrderAt).split(",")[0]}` : ""};{" "}
                {history.earlierOrdersDelivered} delivered, {history.earlierOrdersDisputed} disputed.
              </>
            )}
          </Fact>
        </dl>
      </CardBody>
    </Card>
  );
}

// --- Payment ----------------------------------------------------------------

export function PaymentSection({ record }: { record: OrderRecord }) {
  const { order, payments, refunds } = record;
  const payment = payments[0];

  return (
    <Card>
      <CardHeader
        title="Payment"
        icon={<CreditCard className="h-4 w-4" aria-hidden="true" />}
        action={payment?.provider === "simulated" ? <SimulatedBadge /> : null}
      />
      <CardBody>
        {!payment ? (
          <p className="text-sm text-ink-500">No payment has been recorded.</p>
        ) : (
          <>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Fact label="Amount">
                <span className="font-medium">{formatMoney(payment.amountMinor, payment.currency)}</span>
                {payment.amountRefundedMinor > 0 ? (
                  <span className="block text-ink-500">
                    {formatMoney(payment.amountRefundedMinor, payment.currency)} refunded
                  </span>
                ) : null}
              </Fact>
              <Fact label="Paid">{formatDateTime(payment.paidAt, true)}</Fact>
              <Fact label="Method">
                {payment.cardBrand
                  ? `${payment.cardBrand.toUpperCase()} ending ${payment.cardLast4 ?? "····"}`
                  : sentenceCase(payment.paymentMethodType ?? "Unknown")}
                {payment.cardFunding || payment.cardCountry ? (
                  <span className="block text-ink-500">
                    {[payment.cardFunding ? sentenceCase(payment.cardFunding) : null, payment.cardCountry]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                ) : null}
              </Fact>
              <Fact label="Processor risk level">
                {payment.riskLevel ? (
                  <>
                    {sentenceCase(payment.riskLevel)}
                    {payment.riskScore !== null ? <span className="text-ink-500"> (score {payment.riskScore})</span> : null}
                  </>
                ) : (
                  <span className="text-ink-400">Not provided</span>
                )}
              </Fact>
            </dl>

            <div className="mt-4">
              <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">Authentication checks</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                <li>
                  <Badge tone={checkTone(payment.cvcCheck)}>CVC {describeCheck(payment.cvcCheck)}</Badge>
                </li>
                <li>
                  <Badge tone={checkTone(payment.postalCodeCheck)}>
                    Postcode {describeCheck(payment.postalCodeCheck)}
                  </Badge>
                </li>
                <li>
                  <Badge tone={checkTone(payment.addressLine1Check)}>
                    Address line {describeCheck(payment.addressLine1Check)}
                  </Badge>
                </li>
                <li>
                  <Badge tone={payment.threeDSecure?.result === "authenticated" ? "seal" : "neutral"}>
                    3D Secure {describeThreeDSecure(payment.threeDSecure?.result)}
                  </Badge>
                </li>
              </ul>
            </div>

            <dl className="mt-4 grid gap-3 border-t border-line pt-4">
              {payment.paymentIntentId ? (
                <Fact label="Payment reference">
                  <Mono>{payment.paymentIntentId}</Mono>
                </Fact>
              ) : null}
              {payment.chargeId ? (
                <Fact label="Charge reference">
                  <Mono>{payment.chargeId}</Mono>
                </Fact>
              ) : null}
              {payment.receiptUrl ? (
                <Fact label="Receipt">
                  <a
                    href={payment.receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-transit-700 underline underline-offset-2"
                  >
                    Open the processor&rsquo;s receipt
                  </a>
                </Fact>
              ) : null}
            </dl>
          </>
        )}

        {refunds.length > 0 ? (
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">Refunds</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {refunds.map((refund) => (
                <li key={refund.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {formatMoney(refund.amountMinor, refund.currency)}
                    <span className="text-ink-500"> · {formatDateTime(refund.createdAt)}</span>
                  </span>
                  {refund.simulated ? <SimulatedBadge /> : <Mono>{refund.stripeRefundId}</Mono>}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="mt-4 text-xs text-ink-400">
          Card numbers are never stored. Order total {formatMoney(order.totalMinor, order.currency)}.
        </p>
      </CardBody>
    </Card>
  );
}

// --- Packing ----------------------------------------------------------------

const SCAN_RESULT: Record<ScanResult, { label: string; tone: "seal" | "signal" | "amber" }> = {
  ok: { label: "Verified", tone: "seal" },
  wrong_item: { label: "Wrong item", tone: "signal" },
  over_quantity: { label: "Too many", tone: "signal" },
  unknown_code: { label: "Unknown code", tone: "signal" },
  wrong_label: { label: "Wrong label", tone: "signal" },
  override: { label: "Override", tone: "amber" },
};

function EvidencePhoto({ file, caption }: { file: EvidenceFile; caption: string }) {
  const href = `/api/evidence/files/${file.id}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group block overflow-hidden rounded-lg border border-line"
      title={`SHA-256 ${file.sha256}`}
    >
      {/* Served by an authenticated route, not the image optimiser. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={href} alt={caption} className="aspect-[4/3] w-full object-cover group-hover:opacity-90" loading="lazy" />
      <span className="block border-t border-line px-2 py-1.5">
        <span className="block text-xs font-medium text-ink-900">{caption}</span>
        <span className="block font-mono text-[11px] text-ink-500">sha256 {shortHash(file.sha256, 12)}</span>
      </span>
    </a>
  );
}

export function PackingSection({ record }: { record: OrderRecord }) {
  const { order, items, packingSessions, files } = record;
  const session = packingSessions[packingSessions.length - 1];
  const filesById = new Map(files.map((file) => [file.id, file]));
  const canPack = ["paid", "disputed"].includes(order.paymentStatus) && ["unfulfilled", "packing"].includes(order.fulfilmentStatus);

  return (
    <Card>
      <CardHeader
        title="Packing"
        icon={<ScanBarcode className="h-4 w-4" aria-hidden="true" />}
        action={session?.simulated ? <SimulatedBadge /> : null}
      />
      <CardBody>
        {!session ? (
          <div className="text-sm">
            <p className="text-ink-500">This order has not been packed yet.</p>
            {canPack ? (
              <Link
                href={`/app/pack/${order.number}`}
                className="mt-2 inline-block font-medium text-transit-700 underline underline-offset-2"
              >
                Pack it at the packing station
              </Link>
            ) : null}
          </div>
        ) : (
          <>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Fact label="Status">
                {session.status === "completed" ? (
                  <Badge tone="seal">Packed and verified</Badge>
                ) : session.status === "completed_with_exceptions" ? (
                  <Badge tone="amber">Packed with exceptions</Badge>
                ) : session.status === "abandoned" ? (
                  <Badge tone="neutral">Abandoned</Badge>
                ) : (
                  <Badge tone="transit">In progress</Badge>
                )}
              </Fact>
              <Fact label="Packed by">
                {session.packerName ?? "Unknown"}
                <span className="block text-ink-500">{session.stationLabel}</span>
              </Fact>
              <Fact label="Started">{formatDateTime(session.startedAt, true)}</Fact>
              <Fact label="Finished">
                {session.completedAt ? formatDateTime(session.completedAt, true) : <span className="text-ink-400">Not finished</span>}
                {session.durationMs !== null ? (
                  <span className="block text-ink-500">Took {formatDuration(session.durationMs)}</span>
                ) : null}
              </Fact>
            </dl>

            <div className="mt-4">
              <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">Items scanned against the order</p>
              <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
                {items.map((item) => {
                  const verified = session.itemCounts[item.id] ?? 0;
                  const complete = verified >= item.quantity;
                  return (
                    <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate text-ink-900">{item.name}</span>
                        <span className="block font-mono text-[11px] text-ink-500">{item.barcode}</span>
                      </span>
                      <Badge tone={complete ? "seal" : "amber"}>
                        {verified} of {item.quantity} scanned
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            </div>

            {session.exceptions.length > 0 ? (
              <div className="mt-4">
                <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">Exceptions and overrides</p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {session.exceptions.map((exception, index) => (
                    <li key={index} className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                      <span className="font-medium">{sentenceCase(exception.kind)}</span>
                      {exception.overridden ? " (overridden)" : ""}
                      {exception.note ? `: ${exception.note}` : ""}
                      {exception.code ? <span className="block font-mono text-[11px]">{exception.code}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {session.contentsPhotoFileId || session.labelPhotoFileId ? (
              <div className="mt-4">
                <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-ink-500 uppercase">
                  <Camera className="h-3.5 w-3.5" aria-hidden="true" /> Photographs
                </p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  {[
                    { id: session.contentsPhotoFileId, caption: "Contents before sealing" },
                    { id: session.labelPhotoFileId, caption: "Labelled parcel" },
                  ].map(({ id, caption }) => {
                    const file = id ? filesById.get(id) : undefined;
                    return file ? <EvidencePhoto key={caption} file={file} caption={caption} /> : null;
                  })}
                </div>
              </div>
            ) : null}

            {session.scans.length > 0 ? (
              <details className="mt-4 text-sm">
                <summary className="w-fit text-ink-500 hover:text-ink-900">
                  Scan log ({session.scans.length} scan{session.scans.length === 1 ? "" : "s"})
                </summary>
                <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
                  {session.scans.map((scan) => (
                    <li key={scan.id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-[13px]">
                      <span className="min-w-0">
                        <span className="font-mono text-[12px] text-ink-900">{scan.code}</span>
                        <span className="text-ink-500">
                          {" "}
                          · {scan.kind} · {scan.method} · {formatDateTime(scan.at, true).split(", ")[1]}
                        </span>
                      </span>
                      <Badge tone={SCAN_RESULT[scan.result]?.tone ?? "amber"}>
                        {SCAN_RESULT[scan.result]?.label ?? scan.result}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            <p className="mt-4 text-xs text-ink-400">
              Scans and photos show what was recorded at the packing bench. They do not prove what the
              customer received.
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

// --- Courier ----------------------------------------------------------------

const SHIPMENT_STATUS: Record<string, string> = {
  label_created: "Label created, not yet handed over",
  handed_to_carrier: "Handed to the carrier",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  exception: "Delivery problem",
};

export function CourierSection({ record, controls }: { record: OrderRecord; controls?: React.ReactNode }) {
  const { shipment, files } = record;
  const podFile = shipment?.proofOfDelivery?.fileId
    ? files.find((file) => file.id === shipment.proofOfDelivery?.fileId)
    : undefined;

  return (
    <Card>
      <CardHeader
        title="Courier"
        icon={<Truck className="h-4 w-4" aria-hidden="true" />}
        action={shipment?.simulated ? <SimulatedBadge /> : null}
      />
      <CardBody>
        {!shipment ? (
          <p className="text-sm text-ink-500">No shipping label has been created.</p>
        ) : (
          <>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Fact label="Carrier">
                {shipment.carrier}
                <span className="block text-ink-500">{shipment.service}</span>
              </Fact>
              <Fact label="Tracking number">
                <Mono>{shipment.trackingNumber}</Mono>
              </Fact>
              <Fact label="Status" className="sm:col-span-2">
                {SHIPMENT_STATUS[shipment.status] ?? sentenceCase(shipment.status)}
              </Fact>
              <Fact label="Label created">{formatDateTime(shipment.labelCreatedAt)}</Fact>
              <Fact label="Handed to carrier">
                {shipment.handedToCarrierAt ? formatDateTime(shipment.handedToCarrierAt) : <span className="text-ink-400">Not yet</span>}
              </Fact>
              <Fact label="Delivered">
                {shipment.deliveredAt ? formatDateTime(shipment.deliveredAt) : <span className="text-ink-400">Not yet</span>}
              </Fact>
              <Fact label="Proof of delivery">
                {shipment.proofOfDelivery ? (
                  <>
                    {sentenceCase(shipment.proofOfDelivery.method)}
                    {shipment.proofOfDelivery.signedBy ? ` by ${shipment.proofOfDelivery.signedBy}` : ""}
                    {shipment.proofOfDelivery.note ? (
                      <span className="block text-ink-500">{shipment.proofOfDelivery.note}</span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-ink-400">None recorded</span>
                )}
              </Fact>
            </dl>
            {podFile ? (
              <div className="mt-4 max-w-[220px]">
                <EvidencePhoto file={podFile} caption="Proof of delivery" />
              </div>
            ) : null}
          </>
        )}
        {controls ? <div className="mt-4 border-t border-line pt-4">{controls}</div> : null}
      </CardBody>
    </Card>
  );
}

// --- Customer interactions --------------------------------------------------

const COMPLAINT_STATUS: Record<string, { label: string; tone: "amber" | "seal" | "signal" | "transit" | "neutral" }> = {
  new: { label: "New", tone: "amber" },
  investigating: { label: "Investigating", tone: "transit" },
  awaiting_customer: { label: "Waiting for the customer", tone: "transit" },
  resolved: { label: "Resolved", tone: "seal" },
  escalated: { label: "Escalated to a chargeback", tone: "signal" },
};

export function InteractionsSection({ record }: { record: OrderRecord }) {
  const { complaints } = record;
  return (
    <Card>
      <CardHeader title="Customer interactions" icon={<MessagesSquare className="h-4 w-4" aria-hidden="true" />} />
      <CardBody>
        {complaints.length === 0 ? (
          <p className="text-sm text-ink-500">No complaints or messages about this order.</p>
        ) : (
          <ul className="space-y-3">
            {complaints.map((complaint) => {
              const status = COMPLAINT_STATUS[complaint.status] ?? { label: complaint.status, tone: "neutral" as const };
              return (
                <li key={complaint.id}>
                  <Link
                    href={`/app/complaints/${complaint.number}`}
                    className="block rounded-lg border border-line p-3 transition-colors hover:bg-ink-50"
                  >
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink-950">
                        {complaint.number} · {complaint.subject}
                      </span>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </span>
                    <span className="mt-1 line-clamp-2 block text-sm text-ink-600">{complaint.body}</span>
                    <span className="mt-1 block text-xs text-ink-500">
                      Received {formatDateTime(complaint.createdAt)}
                      {complaint.resolution ? ` · ${sentenceCase(complaint.resolution)}` : ""}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

// --- Chargeback -------------------------------------------------------------

export function ChargebackSection({ record }: { record: OrderRecord }) {
  const { disputes } = record;
  return (
    <Card>
      <CardHeader title="Chargeback" icon={<Landmark className="h-4 w-4" aria-hidden="true" />} />
      <CardBody>
        {disputes.length === 0 ? (
          <p className="text-sm text-ink-500">No dispute has been filed with the bank.</p>
        ) : (
          <ul className="space-y-3">
            {disputes.map((dispute) => (
              <li key={dispute.id}>
                <Link
                  href={`/app/disputes/${dispute.id}`}
                  className="block rounded-lg border border-line p-3 transition-colors hover:bg-ink-50"
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink-950">
                      {disputeReasonLabel(dispute.reason)} · {formatMoney(dispute.amountMinor, dispute.currency)}
                    </span>
                    <DisputeBadge stripeStatus={dispute.stripeStatus} outcome={dispute.outcome} />
                  </span>
                  <span className="mt-1 block text-xs text-ink-500">
                    <Mono>{dispute.stripeDisputeId}</Mono>
                    {dispute.outcome === null && dispute.evidenceDueBy ? (
                      <> · evidence due {formatRelative(dispute.evidenceDueBy)}</>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
