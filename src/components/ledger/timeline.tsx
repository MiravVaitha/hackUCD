import {
  Camera,
  CircleAlert,
  CreditCard,
  FileText,
  Landmark,
  MessageSquare,
  PackageCheck,
  RotateCcw,
  ScanBarcode,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Tag,
  Truck,
  Undo2,
  type LucideIcon,
} from "lucide-react";

import { SimulatedBadge } from "@/components/ui/badge";
import type { EvidenceFile, LedgerEvent } from "@/db/schema";
import { evidenceId, ledgerLabel, ledgerStage, type LifecycleStage } from "@/lib/ledger/types";
import { sourceLabel } from "@/lib/orders/labels";
import { cn, formatDateTime, shortHash } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  "order.placed": ShoppingBag,
  "payment.succeeded": CreditCard,
  "payment.failed": CircleAlert,
  "payment.early_fraud_warning": ShieldAlert,
  "packing.started": ScanBarcode,
  "packing.item_verified": ScanBarcode,
  "packing.mismatch": CircleAlert,
  "packing.override": CircleAlert,
  "packing.contents_photo": Camera,
  "packing.label_verified": Tag,
  "packing.label_photo": Camera,
  "packing.completed": PackageCheck,
  "shipment.label_created": Tag,
  "shipment.handed_to_carrier": Truck,
  "shipment.in_transit": Truck,
  "shipment.out_for_delivery": Truck,
  "shipment.delivered": PackageCheck,
  "shipment.exception": CircleAlert,
  "complaint.received": MessageSquare,
  "complaint.investigated": Sparkles,
  "complaint.reply_sent": MessageSquare,
  "complaint.customer_replied": MessageSquare,
  "complaint.resolved": PackageCheck,
  "refund.issued": Undo2,
  "replacement.sent": RotateCcw,
  "dispute.opened": Landmark,
  "dispute.evidence_prepared": FileText,
  "dispute.submitted": FileText,
  "dispute.updated": Landmark,
  "dispute.funds_withdrawn": Landmark,
  "dispute.funds_reinstated": Landmark,
  "dispute.closed": Landmark,
};

const STAGE_TONE: Record<LifecycleStage, string> = {
  checkout: "bg-ink-100 text-ink-700",
  payment: "bg-ink-100 text-ink-700",
  packing: "bg-transit-50 text-transit-700",
  dispatch: "bg-transit-50 text-transit-700",
  delivery: "bg-seal-50 text-seal-700",
  complaint: "bg-amber-50 text-amber-700",
  resolution: "bg-seal-50 text-seal-700",
  chargeback: "bg-signal-50 text-signal-700",
  outcome: "bg-seal-50 text-seal-700",
};

const PROBLEM_TYPES = new Set(["packing.mismatch", "packing.override", "shipment.exception", "payment.failed"]);

function isImage(file: EvidenceFile | undefined): boolean {
  return Boolean(file && file.mime.startsWith("image/"));
}

/**
 * The order's evidence ledger in the order it happened. Each entry shows its
 * source, its evidence ID (cited by the AI as E1, E2, ...) and the start of
 * its hash.
 */
export function LedgerTimeline({
  events,
  files,
  highlight,
}: {
  events: LedgerEvent[];
  files: EvidenceFile[];
  /** Ledger sequence numbers to emphasise, e.g. those cited by an investigation. */
  highlight?: number[];
}) {
  const filesById = new Map(files.map((file) => [file.id, file]));
  const highlighted = new Set(highlight ?? []);

  if (events.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-ink-500">Nothing has been recorded for this order yet.</p>;
  }

  return (
    <ol className="px-5 py-4">
      {events.map((event, index) => {
        const Icon = ICONS[event.type] ?? FileText;
        const stage = ledgerStage(event.type);
        const tone = PROBLEM_TYPES.has(event.type)
          ? "bg-signal-50 text-signal-700"
          : stage
            ? STAGE_TONE[stage]
            : "bg-ink-100 text-ink-700";
        const hasPayload = Object.keys(event.payload ?? {}).length > 0;

        return (
          <li
            key={event.id}
            id={`evidence-${event.seq}`}
            className={cn(
              "relative flex scroll-mt-24 gap-3 pb-5 last:pb-0",
              highlighted.has(event.seq) && "rounded-lg bg-draft-50/60",
            )}
          >
            {index < events.length - 1 ? (
              <span className="absolute top-9 bottom-0 left-[17px] w-px bg-line" aria-hidden="true" />
            ) : null}
            <span
              className={cn(
                "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                tone,
              )}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="text-sm font-semibold text-ink-950">{ledgerLabel(event.type)}</p>
                <time
                  dateTime={event.occurredAt.toISOString()}
                  className="text-xs text-ink-500 tabular-nums"
                >
                  {formatDateTime(event.occurredAt, true)}
                </time>
              </div>
              <p className="mt-0.5 text-sm leading-relaxed text-ink-700">{event.summary}</p>

              {event.attachments.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {event.attachments.map((attachment) => {
                    const file = filesById.get(attachment.fileId);
                    const href = `/api/evidence/files/${attachment.fileId}`;
                    return (
                      <li key={attachment.fileId}>
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="group block overflow-hidden rounded-lg border border-line bg-ink-50"
                          title={`SHA-256 ${attachment.sha256}`}
                        >
                          {isImage(file) ? (
                            // Evidence images are served by an authenticated route, not the image optimiser.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={href}
                              alt={ledgerLabel(event.type)}
                              className="h-24 w-32 object-cover transition-opacity group-hover:opacity-90"
                              loading="lazy"
                            />
                          ) : (
                            <span className="flex h-24 w-32 flex-col items-center justify-center gap-1 text-ink-500">
                              <FileText className="h-6 w-6" aria-hidden="true" />
                              <span className="text-xs">Open file</span>
                            </span>
                          )}
                          <span className="block border-t border-line bg-white px-2 py-1 font-mono text-[11px] text-ink-500">
                            sha256 {shortHash(attachment.sha256, 12)}
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
                <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-ink-700">
                  {evidenceId(event.seq)}
                </span>
                <span>{sourceLabel(event.source)}</span>
                {event.sourceRef ? (
                  <span className="max-w-[16rem] truncate font-mono text-[11px]" title={event.sourceRef}>
                    {event.sourceRef}
                  </span>
                ) : null}
                {event.actorLabel && event.actorType === "user" ? <span>by {event.actorLabel}</span> : null}
                <span className="font-mono text-[11px]" title={`Hash ${event.hash}\nPrevious ${event.prevHash}`}>
                  #{shortHash(event.hash, 10)}
                </span>
                {event.simulated ? <SimulatedBadge /> : null}
              </p>

              {hasPayload ? (
                <details className="mt-1.5 text-xs">
                  <summary className="w-fit text-ink-500 hover:text-ink-900">Recorded details</summary>
                  <pre className="mt-1.5 max-h-72 overflow-auto rounded-lg bg-ink-950 p-3 font-mono text-[11px] leading-relaxed text-ink-100">
                    {JSON.stringify(event.payload, null, 2)}
                  </pre>
                  <p className="mt-1 font-mono text-[11px] break-all text-ink-400">
                    hash {event.hash}
                    <br />
                    prev {event.prevHash}
                  </p>
                </details>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
