import {
  ArrowRight,
  Camera,
  Check,
  CreditCard,
  FileDown,
  Landmark,
  MessagesSquare,
  ScanBarcode,
  Sparkles,
  Truck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EvidencePreview } from "@/components/marketing/evidence-preview";
import {
  ClosingCta,
  Eyebrow,
  PREMIUM_PRICE,
  PrimaryCta,
  SecondaryCta,
  SiteShell,
} from "@/components/marketing/site-shell";
import { SetupNotice } from "@/components/setup-notice";

export const metadata: Metadata = {
  title: { absolute: "Verity · Order evidence for small merchants" },
  description:
    "Verity keeps every order's payment, packing, delivery and customer evidence in one place. Free to use, with optional AI drafting in Premium.",
};

// Reads deployment configuration for the setup notice, so render per request.
export const dynamic = "force-dynamic";

const RECORDED = [
  { icon: CreditCard, title: "Payment checks", text: "CVC and address checks, 3D Secure and the processor's risk level." },
  { icon: ScanBarcode, title: "Packing scans", text: "Each item scanned against the order, with overrides recorded." },
  { icon: Camera, title: "Parcel photos", text: "Open and labelled parcel, hashed the moment they are stored." },
  { icon: Truck, title: "Delivery information", text: "Handed over, in transit and delivered, with proof of delivery." },
  { icon: MessagesSquare, title: "Customer messages", text: "Complaints, replies and refunds, attached to the right order." },
  { icon: Landmark, title: "Dispute history", text: "Reason, deadline, what was submitted and how the bank decided." },
];

const FREE = [
  "Dashboard, orders and complaints",
  "Delivery information per order",
  "Manual evidence and PDF exports",
];

const PREMIUM = [
  "AI complaint analysis",
  "AI bank-response drafts",
  "AI win-likelihood estimate",
];

export default function HomePage() {
  return (
    <SiteShell current="home">
      {/* Hero */}
      <section className="mx-auto grid w-full max-w-6xl gap-14 overflow-x-clip px-4 pt-12 pb-20 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-20 lg:pb-24">
        <div className="animate-rise">
          <Eyebrow>Order evidence for small merchants</Eyebrow>
          <h1 className="mt-4 font-display text-[44px] leading-[1.02] tracking-tight text-balance sm:text-6xl lg:text-[68px]">
            Every order&rsquo;s proof, in <span className="text-(--v-red)">one place</span>.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-(--v-grey)">
            Verity keeps what was paid for, packed, delivered and said about each order together.
            When a customer complains or a bank opens a dispute, the evidence is already there.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <PrimaryCta href="/login">
              Start free <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </PrimaryCta>
            <SecondaryCta href="/pricing">See pricing</SecondaryCta>
          </div>
          <p className="mt-5 text-sm text-(--v-grey)">
            Free to use. AI drafting with Premium, {PREMIUM_PRICE}/month.
          </p>
        </div>

        <div className="animate-rise mx-auto w-full max-w-md lg:max-w-none" style={{ animationDelay: "120ms" }}>
          <EvidencePreview />
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-8">
        <SetupNotice className="mb-10" />
      </div>

      {/* Free and Premium */}
      <section className="border-y border-(--v-line) bg-(--v-egg-soft)">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-8">
          <div className="max-w-2xl">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-3 font-display text-4xl leading-tight text-balance sm:text-[44px]">
              Organise evidence for free. Let AI help when it counts.
            </h2>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <PlanSummary icon={FileDown} label="Free" title="Your evidence, organised" items={FREE} />
            <PlanSummary
              icon={Sparkles}
              label={`Premium · ${PREMIUM_PRICE}/month`}
              title="AI that works from your records"
              items={PREMIUM}
              accent
            />
          </div>
          <p className="mt-6 text-sm text-(--v-grey)">
            AI drafts are reviewed by a person before anything is exported. Win likelihood is an AI
            estimate, never a guaranteed outcome.
          </p>
        </div>
      </section>

      {/* What goes on the record */}
      <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-8">
        <div className="max-w-2xl">
          <Eyebrow>One record per order</Eyebrow>
          <h2 className="mt-3 font-display text-4xl leading-tight text-balance sm:text-[44px]">
            What goes on the record.
          </h2>
          <p className="mt-4 leading-relaxed text-(--v-grey)">
            Each entry is hashed and chained, so later edits show up when the record is checked.
          </p>
        </div>
        <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {RECORDED.map((item) => (
            <div key={item.title} className="flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--v-red)/10 text-(--v-red)">
                <item.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-(--v-grey)">{item.text}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-12 text-sm text-(--v-grey)">
          This demo uses simulated payment and courier connectors.{" "}
          <Link href="/store" className="font-medium text-(--v-red-dark) underline underline-offset-4 hover:text-(--v-red)">
            Place a test order at Voltbox
          </Link>
          , a fictional shop, to watch a record being built.
        </p>
      </section>

      <ClosingCta />
    </SiteShell>
  );
}

function PlanSummary({
  icon: Icon,
  label,
  title,
  items,
  accent = false,
}: {
  icon: typeof Check;
  label: string;
  title: string;
  items: string[];
  accent?: boolean;
}) {
  return (
    <div
      className={
        accent
          ? "rounded-2xl bg-(--v-ink) p-7 text-white"
          : "rounded-2xl border border-(--v-line) bg-white p-7"
      }
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${accent ? "bg-(--v-red) text-white" : "bg-(--v-red)/10 text-(--v-red)"}`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className={`text-sm font-semibold ${accent ? "text-white/70" : "text-(--v-grey)"}`}>{label}</p>
      </div>
      <h3 className="mt-5 text-xl font-semibold">{title}</h3>
      <ul className="mt-4 space-y-2.5">
        {items.map((item) => (
          <li key={item} className={`flex gap-2.5 text-[15px] ${accent ? "text-white/80" : "text-(--v-grey)"}`}>
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-(--v-red)" strokeWidth={3} aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
