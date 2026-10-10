import { Camera, CreditCard, MessagesSquare, ScanBarcode, Sparkles, Truck } from "lucide-react";

const SOURCES = [
  { icon: CreditCard, label: "Payment checks", detail: "CVC and postcode matched", source: "Simulated connector" },
  { icon: ScanBarcode, label: "Packing scans", detail: "2 of 2 items verified", source: "Packing station" },
  { icon: Camera, label: "Parcel photo", detail: "sha256 9f2c41a0…", source: "Packing station" },
  { icon: Truck, label: "Delivery scan", detail: "Signed for at the address", source: "Simulated connector" },
  { icon: MessagesSquare, label: "Customer messages", detail: "3 messages, 1 reply", source: "Inbox" },
];

/** Illustrative dispute case for the hero. Sample data only. */
export function EvidencePreview() {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="absolute -inset-4 -z-10 rotate-2 rounded-[28px] bg-(--v-red)/10 sm:-inset-6"
      />
      <figure
        aria-label="Sample dispute case in Verity"
        className="overflow-hidden rounded-2xl border border-(--v-line) bg-white shadow-[0_24px_60px_-20px_rgb(33_37_41/0.35)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-(--v-line) bg-(--v-egg-soft) px-4 py-3">
          <div className="min-w-0">
            <p className="font-mono text-xs text-(--v-grey)">Dispute · VB-1042</p>
            <p className="text-sm font-semibold text-(--v-ink)">Item not received</p>
          </div>
          <span className="shrink-0 rounded-full bg-(--v-red)/10 px-2.5 py-1 text-[11px] font-medium text-(--v-red-dark)">
            Respond in 9 days
          </span>
        </div>

        <ul className="divide-y divide-(--v-line)/70 px-4">
          {SOURCES.map((item) => (
            <li key={item.label} className="flex items-center gap-3 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-(--v-egg) text-(--v-ink)">
                <item.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-(--v-ink)">{item.label}</p>
                <p className="truncate text-xs text-(--v-grey)">{item.detail}</p>
              </div>
              <span className="hidden shrink-0 rounded-md border border-dashed border-(--v-line) px-1.5 py-0.5 text-[10px] text-(--v-grey) sm:inline">
                {item.source}
              </span>
            </li>
          ))}
        </ul>

        <div className="m-4 mt-2 rounded-xl border border-(--v-line) bg-(--v-egg-soft) p-3.5">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-(--v-ink)">
              <Sparkles className="h-3.5 w-3.5 text-(--v-red)" aria-hidden="true" />
              AI draft for the bank
            </p>
            <span className="rounded-full bg-(--v-ink) px-2 py-0.5 text-[10px] font-medium text-white">
              Premium · needs review
            </span>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-(--v-grey)">
            The order was packed on 3 March with both items scanned against the order. The courier
            recorded delivery, signed for at the billing address, on 5 March&hellip;
          </p>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-(--v-line) pt-3">
            <p className="text-xs text-(--v-grey)">
              Win likelihood <span className="text-(--v-grey)/80">(AI estimate, not a guarantee)</span>
            </p>
            <p className="text-xs font-semibold text-(--v-ink)">Moderate to high</p>
          </div>
        </div>
      </figure>
      <p className="mt-3 text-center text-xs text-(--v-grey)">Sample case. Fictional data.</p>
    </div>
  );
}
