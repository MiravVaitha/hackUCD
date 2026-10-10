import { Eye, Scale, UserCheck } from "lucide-react";
import type { Metadata } from "next";

import { ClosingCta, Eyebrow, SiteShell } from "@/components/marketing/site-shell";

export const metadata: Metadata = {
  title: { absolute: "About · Verity" },
  description:
    "Why we built Verity: small merchants deserve a fair, organised way to answer disputes with the facts.",
};

const PRINCIPLES = [
  {
    icon: Scale,
    title: "Facts, not accusations",
    text: "Verity reports what the records show and what they cannot. It never labels a customer dishonest, and a short-packed order shows up as one.",
  },
  {
    icon: UserCheck,
    title: "A person stays in charge",
    text: "With Premium, AI helps with analysis and first drafts. A member of your team reviews every word and approves every export.",
  },
  {
    icon: Eye,
    title: "Honest about limits",
    text: "Records are tamper-evident, not tamper-proof. Win likelihood is an AI estimate; the bank makes the decision.",
  },
];

export default function AboutPage() {
  return (
    <SiteShell current="about">
      <section className="mx-auto w-full max-w-6xl px-4 pt-14 pb-16 sm:px-8 lg:pt-20">
        <div className="max-w-3xl">
          <Eyebrow>About Verity</Eyebrow>
          <h1 className="mt-4 font-display text-5xl leading-[1.05] tracking-tight text-balance text-(--v-ink) sm:text-6xl">
            Small shops deserve a fair hearing too.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-(--v-grey)">
            When a customer disputes a card payment, a large retailer has a team and tooling to
            respond. A small online shop has a few days, a busy inbox and evidence spread across
            half a dozen services. Verity exists to close that gap.
          </p>
        </div>
      </section>

      <section className="border-y border-(--v-line) bg-(--v-egg-soft)">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-8 md:grid-cols-2">
          <div>
            <Eyebrow>The name</Eyebrow>
            <p className="mt-4 font-display text-4xl leading-tight text-(--v-ink) sm:text-5xl">
              <span className="text-(--v-red)">Verity</span> (n.)
              <span className="block text-2xl text-(--v-grey) sm:text-3xl">a true principle or statement; truthfulness.</span>
            </p>
          </div>
          <div className="space-y-4 leading-relaxed text-(--v-grey)">
            <p>
              We chose the name because a good dispute response is simply the truth, well
              organised: what was ordered, what was paid, what was packed, what the courier
              recorded and what the customer said.
            </p>
            <p>
              Verity keeps that record as orders happen, so when a bank asks, the answer is already
              assembled. An AI assistant turns the record into a clear draft, and you decide what
              gets sent.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-8">
        <Eyebrow>How we build it</Eyebrow>
        <h2 className="mt-3 max-w-2xl font-display text-4xl leading-tight text-balance text-(--v-ink) sm:text-[44px]">
          Three principles we don&rsquo;t compromise on.
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {PRINCIPLES.map((item) => (
            <div key={item.title} className="rounded-2xl border border-(--v-line) bg-white p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-(--v-red)/10 text-(--v-red)">
                <item.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-lg font-semibold text-(--v-ink)">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-(--v-grey)">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-8">
        <div className="rounded-2xl border border-dashed border-(--v-grey)/40 p-6 sm:p-8">
          <p className="font-semibold text-(--v-ink)">About this demo</p>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-(--v-grey)">
            Verity was built as a hackathon prototype. The shop you can order from, Voltbox, is
            fictional, as are its customers. Payment and courier data arrives through simulated
            connectors, Premium checkout runs in Stripe test mode, and evidence exports are produced for a
            person to review. There are no live bank, card scheme or carrier integrations.
          </p>
        </div>
      </section>

      <ClosingCta />
    </SiteShell>
  );
}
