import { ArrowRight, Check, Minus, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import {
  Eyebrow,
  PREMIUM_PRICE,
  SiteShell,
  UPGRADE_HREF,
} from "@/components/marketing/site-shell";

export const metadata: Metadata = {
  title: { absolute: "Pricing · Verity" },
  description: `Verity is free for orders, complaints, delivery information and evidence exports. Premium adds AI features for ${PREMIUM_PRICE} a month.`,
};

const FREE_FEATURES = [
  "Dashboard with every order",
  "Complaint inbox linked to orders",
  "Delivery information per order",
  "Manual evidence and PDF exports",
];

const PREMIUM_FEATURES = [
  "Everything in Free",
  "AI complaint analysis",
  "AI bank-response drafts",
  "AI win-likelihood estimate",
];

const COMPARISON: { feature: string; free: boolean; premium: boolean }[] = [
  { feature: "Dashboard and order timeline", free: true, premium: true },
  { feature: "Complaints linked to orders", free: true, premium: true },
  { feature: "Delivery information", free: true, premium: true },
  { feature: "Manual evidence and PDF exports", free: true, premium: true },
  { feature: "AI complaint analysis", free: false, premium: true },
  { feature: "AI bank-response drafting", free: false, premium: true },
  { feature: "AI win-likelihood estimate", free: false, premium: true },
];

const FAQ = [
  {
    q: "Do I need to pay to use the dashboard?",
    a: "No. The dashboard, orders, complaints, delivery information and manual exports are free.",
  },
  {
    q: "Is anything charged in this demo?",
    a: "No. Premium checkout runs in Stripe test mode, so no real card is charged.",
  },
  {
    q: "What does the win likelihood mean?",
    a: "It is an AI estimate based on the evidence in the record. It is not a guarantee: the bank or card scheme makes the decision.",
  },
  {
    q: "Does the AI send anything for me?",
    a: "No. AI drafts stay drafts until a person reviews them and approves the export.",
  },
];

export default function PricingPage() {
  return (
    <SiteShell current="pricing">
      <section className="mx-auto w-full max-w-5xl px-4 pt-14 pb-16 sm:px-8 lg:pt-20">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Pricing</Eyebrow>
          <h1 className="mt-4 font-display text-5xl leading-[1.05] tracking-tight text-balance sm:text-6xl">
            Free to use. Premium when you want AI.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-(--v-grey)">
            Keep every order&rsquo;s evidence in one place at no cost. Upgrade any time for AI
            analysis and drafting.
            {" "}A small monthly subscription suits independent shops with ongoing support work:
            pay for AI assistance when needed, without an annual commitment.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {/* Free */}
          <div className="flex flex-col rounded-3xl border border-(--v-line) bg-white p-8">
            <p className="font-semibold">Free</p>
            <p className="mt-4 flex items-baseline gap-2">
              <span className="font-display text-6xl leading-none">€0</span>
              <span className="text-(--v-grey)">forever</span>
            </p>
            <p className="mt-3 text-sm text-(--v-grey)">Everything you need to organise evidence.</p>
            <FeatureList items={FREE_FEATURES} />
            <Link
              href="/login"
              className="mt-auto inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-(--v-ink)/15 text-[15px] font-medium transition-colors hover:border-(--v-ink)/35"
            >
              Start free
            </Link>
          </div>

          {/* Premium */}
          <div className="relative flex flex-col overflow-hidden rounded-3xl bg-(--v-ink) p-8 text-white">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-(--v-red) opacity-25 blur-3xl"
            />
            <div className="relative flex items-center justify-between">
              <p className="font-semibold">Premium</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-(--v-red) px-2.5 py-1 text-xs font-medium">
                <Sparkles className="h-3 w-3" aria-hidden="true" /> AI features
              </span>
            </div>
            <p className="relative mt-4 flex items-baseline gap-2">
              <span className="font-display text-6xl leading-none">{PREMIUM_PRICE}</span>
              <span className="text-white/70">/ month</span>
            </p>
            <p className="relative mt-3 text-sm text-white/70">Billed monthly. Cancel any time.</p>
            <FeatureList items={PREMIUM_FEATURES} inverted />
            <Link
              href={UPGRADE_HREF}
              className="relative mt-auto inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-(--v-red) text-[15px] font-medium transition-colors hover:bg-(--v-red-dark)"
            >
              Upgrade to Premium <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="mx-auto w-full max-w-5xl px-4 pb-20 sm:px-8">
        <h2 className="font-display text-3xl sm:text-4xl">Compare plans</h2>
        <div className="mt-6 overflow-hidden rounded-2xl border border-(--v-line) bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-(--v-egg-soft) text-(--v-grey)">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium sm:px-6">Feature</th>
                <th scope="col" className="w-20 px-2 py-3 text-center font-medium sm:w-32">Free</th>
                <th scope="col" className="w-20 px-2 py-3 text-center font-medium sm:w-32">Premium</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--v-line)">
              {COMPARISON.map((row) => (
                <tr key={row.feature}>
                  <th scope="row" className="px-4 py-3.5 font-normal sm:px-6">{row.feature}</th>
                  <td className="px-2 py-3.5 text-center"><Mark on={row.free} /></td>
                  <td className="px-2 py-3.5 text-center"><Mark on={row.premium} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-(--v-grey)">
          Win likelihood is an AI estimate, never a guaranteed outcome. AI drafts are reviewed by a
          person before export.
        </p>
      </section>

      {/* FAQ */}
      <section className="border-t border-(--v-line) bg-(--v-egg-soft)">
        <div className="mx-auto grid w-full max-w-5xl gap-x-10 gap-y-8 px-4 py-16 sm:grid-cols-2 sm:px-8">
          {FAQ.map((item) => (
            <div key={item.q}>
              <h3 className="font-semibold">{item.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-(--v-grey)">{item.a}</p>
            </div>
          ))}
        </div>
      </section>
    </SiteShell>
  );
}

function FeatureList({ items, inverted = false }: { items: string[]; inverted?: boolean }) {
  return (
    <ul className="relative my-8 space-y-3">
      {items.map((item) => (
        <li key={item} className={`flex gap-3 text-[15px] ${inverted ? "text-white/85" : "text-(--v-grey)"}`}>
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-(--v-red)" strokeWidth={3} aria-hidden="true" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function Mark({ on }: { on: boolean }) {
  return on ? (
    <Check className="mx-auto h-4 w-4 text-(--v-red)" strokeWidth={3} aria-label="Included" />
  ) : (
    <Minus className="mx-auto h-4 w-4 text-(--v-grey)/50" aria-label="Not included" />
  );
}
