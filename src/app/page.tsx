import {
  ArrowRight,
  Camera,
  CreditCard,
  FileCheck2,
  Landmark,
  MessagesSquare,
  PackageCheck,
  ScanBarcode,
  Truck,
} from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { LIFECYCLE_STEPS } from "@/components/lifecycle";
import { SetupNotice } from "@/components/setup-notice";
import { LinkButton } from "@/components/ui/button";

// Reads deployment configuration for the setup notice, so render per request.
export const dynamic = "force-dynamic";

const SAMPLE_RECORD = [
  { tone: "seal", title: "Payment succeeded", detail: "CVC and postcode checks passed" },
  { tone: "seal", title: "2 of 2 items scanned", detail: "Station 1, verified against the order" },
  { tone: "seal", title: "Photo of open parcel", detail: "sha256 9f2c41a07e…" },
  { tone: "seal", title: "Delivered", detail: "Courier scan, signed for at the address" },
  { tone: "amber", title: "Complaint: “it never arrived”", detail: "Answered with the delivery record" },
  { tone: "signal", title: "Chargeback opened", detail: "Evidence file built and submitted" },
] as const;

const RECORDED = [
  {
    icon: CreditCard,
    title: "Payment checks",
    text: "Card brand, CVC and address checks, 3D Secure result and the processor's risk level.",
  },
  {
    icon: ScanBarcode,
    title: "Packing scans",
    text: "Each item scanned against the order, with wrong items and overrides recorded.",
  },
  {
    icon: Camera,
    title: "Packing photos",
    text: "The open parcel and the labelled parcel, hashed the moment they are stored.",
  },
  {
    icon: Truck,
    title: "Carrier events",
    text: "Handed over, in transit and delivered kept as separate facts, with proof of delivery.",
  },
  {
    icon: MessagesSquare,
    title: "Customer messages",
    text: "Complaints, replies, refunds and replacements, attached to the order they concern.",
  },
  {
    icon: Landmark,
    title: "Dispute history",
    text: "Reason, deadline, what was submitted and how the bank decided.",
  },
];

const dotTone = {
  seal: "bg-seal-500",
  amber: "bg-amber-500",
  signal: "bg-signal-500",
} as const;

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="ledger-rules bg-ink-950 text-white">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <Logo tone="light" />
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/store"
              className="rounded-lg px-3 py-2 text-sm text-ink-200 transition-colors hover:bg-white/10 hover:text-white"
            >
              Demo store
            </Link>
            <LinkButton href="/login" variant="secondary" size="sm">
              Merchant sign in
            </LinkButton>
          </nav>
        </header>

        <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 pt-10 pb-16 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pt-16 lg:pb-24">
          <div className="animate-rise">
            <p className="text-sm font-medium tracking-wide text-seal-200 uppercase">
              Evidence, complaints and chargebacks for small merchants
            </p>
            <h1 className="mt-4 font-display text-5xl leading-[1.05] tracking-tight text-balance sm:text-6xl">
              Every order, with its evidence attached.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-200">
              ProofShield records what was paid for, what was packed and what was delivered. It uses
              that record twice: to answer a customer&rsquo;s complaint fairly, and to respond to a
              chargeback if one follows.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/store" variant="seal" size="lg">
                Place a test order <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </LinkButton>
              <LinkButton
                href="/login"
                size="lg"
                className="border border-white/20 bg-white/5 text-white hover:bg-white/10 active:bg-white/15"
              >
                Open the merchant app
              </LinkButton>
            </div>
          </div>

          <div
            className="animate-rise rounded-2xl border border-white/10 bg-ink-900 p-5 shadow-raised"
            style={{ animationDelay: "120ms" }}
          >
            <div className="flex items-center justify-between">
              <p className="font-mono text-xs text-ink-300">Order VB-1042 · evidence record</p>
              <span className="rounded-full border border-dashed border-ink-500 px-2 py-0.5 text-[11px] text-ink-300">
                Sample
              </span>
            </div>
            <ol className="mt-4">
              {SAMPLE_RECORD.map((row, index) => (
                <li key={row.title} className="relative flex gap-3 pb-4 last:pb-0">
                  {index < SAMPLE_RECORD.length - 1 ? (
                    <span className="absolute top-3 left-[5px] h-full w-px bg-ink-700" aria-hidden="true" />
                  ) : null}
                  <span
                    className={`relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ring-4 ring-ink-900 ${dotTone[row.tone]}`}
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-medium text-white">{row.title}</p>
                    <p className="text-sm text-ink-300">{row.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 sm:px-8">
        <SetupNotice className="mt-8" />

        <section className="grid gap-5 py-14 md:grid-cols-2">
          <article className="rounded-2xl border border-line bg-white p-7 shadow-card">
            <p className="font-mono text-xs tracking-wide text-seal-700 uppercase">
              Stage 1 · Before the bank
            </p>
            <h2 className="mt-3 font-display text-3xl text-ink-950">Resolve</h2>
            <p className="mt-3 leading-relaxed text-ink-600">
              A customer writes in. ProofShield links the complaint to the order, shows what the
              records confirm and what they cannot, suggests a fair resolution and drafts a reply for
              you to review. Many complaints end here.
            </p>
            <p className="mt-4 flex items-center gap-2 text-sm text-ink-500">
              <PackageCheck className="h-4 w-4 text-seal-600" aria-hidden="true" />
              The evidence works for the customer too: a short-packed order shows up as one.
            </p>
          </article>

          <article className="rounded-2xl border border-line bg-white p-7 shadow-card">
            <p className="font-mono text-xs tracking-wide text-signal-700 uppercase">
              Stage 2 · After the bank
            </p>
            <h2 className="mt-3 font-display text-3xl text-ink-950">Defend</h2>
            <p className="mt-3 leading-relaxed text-ink-600">
              A chargeback arrives. ProofShield selects the evidence that fits the dispute reason,
              includes the earlier conversation, writes a factual rebuttal, builds the evidence file
              and submits it once you approve.
            </p>
            <p className="mt-4 flex items-center gap-2 text-sm text-ink-500">
              <FileCheck2 className="h-4 w-4 text-signal-600" aria-hidden="true" />
              Nothing is sent to the bank without a person approving it.
            </p>
          </article>
        </section>

        <section className="border-t border-line py-12">
          <h2 className="text-sm font-semibold tracking-wide text-ink-500 uppercase">
            One continuous record
          </h2>
          <ol className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-3">
            {LIFECYCLE_STEPS.map((step, index) => (
              <li key={step.key} className="flex items-center gap-2">
                <span className="rounded-full border border-line-strong bg-white px-3.5 py-1.5 text-sm font-medium text-ink-800">
                  {step.label}
                </span>
                {index < LIFECYCLE_STEPS.length - 1 ? (
                  <ArrowRight className="h-4 w-4 text-ink-300" aria-hidden="true" />
                ) : null}
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t border-line py-12">
          <h2 className="text-sm font-semibold tracking-wide text-ink-500 uppercase">
            What goes on the record
          </h2>
          <div className="mt-6 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
            {RECORDED.map((item) => (
              <div key={item.title} className="flex gap-3">
                <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-ink-400" aria-hidden="true" />
                <div>
                  <h3 className="font-medium text-ink-950">{item.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-600">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-line py-12">
          <h2 className="text-sm font-semibold tracking-wide text-ink-500 uppercase">
            What it does not claim
          </h2>
          <ul className="mt-5 grid gap-4 text-sm leading-relaxed text-ink-700 md:grid-cols-3">
            <li className="rounded-xl bg-paper-deep p-4">
              Records are tamper-evident, not tamper-proof. Each entry is hashed and chained so
              later changes show up when the chain is checked.
            </li>
            <li className="rounded-xl bg-paper-deep p-4">
              Scans and photos show what the merchant recorded at the packing bench. They do not
              prove what a customer received, and they never label a customer dishonest.
            </li>
            <li className="rounded-xl bg-paper-deep p-4">
              A complete, well-organised response improves a merchant&rsquo;s case. It does not
              guarantee how a bank decides.
            </li>
          </ul>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-6 text-sm text-ink-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Logo />
          <p>
            Hackathon demo. Voltbox and its customers are fictional, and payments run in Stripe test
            mode.
          </p>
        </div>
      </footer>
    </div>
  );
}
