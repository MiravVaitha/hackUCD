import { Check, Sparkles } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { startSubscription, verifySubscription, cancelSubscription } from "@/app/(merchant)/app/(console)/billing/actions";
import { PREMIUM_PRICE, SiteShell } from "@/components/marketing/site-shell";
import { ActionForm } from "@/components/ui/action-form";
import { requireUser } from "@/lib/auth/guards";
import { confirmSubscriptionCheckout } from "@/lib/stripe/billing";
import { hasSubscription } from "@/lib/subscription";
import { sentenceCase } from "@/lib/utils";

export const metadata = { title: { absolute: "Account · Verity" } };

const FREE_FEATURES = [
  "Dashboard, orders and complaints",
  "Delivery information per order",
  "Manual evidence and PDF exports",
];

const PREMIUM_FEATURES = [
  "AI complaint analysis",
  "AI bank-response drafting",
  "AI win-likelihood estimate",
];

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ session_id?: string; cancelled?: string }> }) {
  const session = await requireUser(undefined, true);
  const query = await searchParams;
  let confirmed = false;
  if (query.session_id && session.user.role === "owner") {
    try { confirmed = await confirmSubscriptionCheckout(query.session_id, session.merchant.id); } catch { /* The retry form below reports a safe error. */ }
  }
  if (confirmed) redirect("/account");

  const billing = session.merchant.settings.billing;
  const premium = hasSubscription(session.merchant);
  const isOwner = session.user.role === "owner";

  return (
    <SiteShell signedIn>
      <section className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-8 lg:py-16">
        <p className="text-xs font-semibold tracking-[0.14em] text-(--v-red-dark) uppercase">Account</p>
        <h1 className="mt-3 font-display text-4xl sm:text-5xl">Your plan</h1>
        <p className="mt-3 text-(--v-grey)">
          {session.merchant.name} · signed in as {session.user.email}
        </p>

        {query.cancelled && (
          <p role="status" className="mt-6 rounded-xl border border-(--v-line) bg-white p-4 text-sm">
            Checkout was cancelled. You&rsquo;re still on the Free plan and can upgrade any time.
          </p>
        )}
        {query.session_id && (
          <div className="mt-6 rounded-xl border border-(--v-line) bg-white p-5 text-sm">
            <p className="mb-4">Back from Stripe? Verify your completed checkout to update this workspace.</p>
            <ActionForm action={verifySubscription} submit="Verify test subscription">
              <input type="hidden" name="sessionId" value={query.session_id} />
            </ActionForm>
          </div>
        )}

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {/* Current plan */}
          <div className="rounded-2xl border border-(--v-line) bg-white p-7">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-(--v-grey)">Current plan</p>
              <span className="rounded-full bg-(--v-red)/10 px-2.5 py-1 text-xs font-semibold text-(--v-red-dark)">
                {premium ? "Premium" : "Free"}
              </span>
            </div>
            <p className="mt-4 font-display text-5xl">
              {premium ? PREMIUM_PRICE : "€0"}
              <span className="font-sans text-base text-(--v-grey)"> {premium ? "/ month" : "forever"}</span>
            </p>
            <ul className="my-6 space-y-2.5">
              {(premium ? [...FREE_FEATURES, ...PREMIUM_FEATURES] : FREE_FEATURES).map((item) => (
                <li key={item} className="flex gap-2.5 text-sm text-(--v-grey)">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-(--v-red)" strokeWidth={3} aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            {billing?.status && (
              <p className="mb-4 text-sm">
                <span className="text-(--v-grey)">Subscription status:</span> {sentenceCase(billing.status)} · Stripe test mode
              </p>
            )}
            <Link
              href="/app"
              className="inline-flex h-11 items-center rounded-xl bg-(--v-ink) px-5 text-sm font-medium text-white transition-colors hover:bg-(--v-red-dark)"
            >
              Go to dashboard
            </Link>
          </div>

          {/* Optional upgrade */}
          {premium ? (
            <div className="rounded-2xl bg-(--v-ink) p-7 text-white">
              <Sparkles className="h-6 w-6 text-(--v-red)" aria-hidden="true" />
              <h2 className="mt-4 text-xl font-semibold">Premium is active</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                AI complaint analysis, bank-response drafts and win-likelihood estimates are
                available in your dashboard. Win likelihood is an AI estimate, not a guaranteed
                outcome.
              </p>
              {isOwner && <details className="mt-6 rounded-xl bg-white p-4 text-ink-950"><summary className="cursor-pointer text-sm font-semibold">Cancel test Premium</summary><div className="mt-4"><ActionForm action={cancelSubscription} submit="Cancel test subscription" variant="danger"><label className="flex gap-2 text-sm"><input name="confirm" type="checkbox" required />Cancel Premium immediately. Keep all orders, evidence and free features.</label></ActionForm></div></details>}
            </div>
          ) : (
            <div className="rounded-2xl bg-(--v-ink) p-7 text-white">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-white/70">Optional upgrade</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-(--v-red) px-2.5 py-1 text-xs font-medium">
                  <Sparkles className="h-3 w-3" aria-hidden="true" /> Premium
                </span>
              </div>
              <p className="mt-4 font-display text-5xl">
                {PREMIUM_PRICE}
                <span className="font-sans text-base text-white/60"> / month</span>
              </p>
              <p className="mt-1 text-sm text-white/60">Billed monthly. Cancel any time.</p>
              <ul className="my-6 space-y-2.5">
                {PREMIUM_FEATURES.map((item) => (
                  <li key={item} className="flex gap-2.5 text-sm text-white/85">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-(--v-red)" strokeWidth={3} aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              {isOwner ? (
                <ActionForm
                  action={startSubscription}
                  submit={`Upgrade for ${PREMIUM_PRICE}/month · test checkout`}
                  pending="Opening Stripe…"
                  variant="danger"
                />
              ) : (
                <p className="text-sm text-white/70">Ask your workspace owner to upgrade.</p>
              )}
              <p className="mt-5 text-xs leading-relaxed text-white/50">
                Stripe test mode only. Use test card 4242 4242 4242 4242 with any future expiry and
                any CVC. No real charge is made. Your free features stay available either way.
              </p>
            </div>
          )}
        </div>
        {isOwner && billing?.paymentStatus === "paid" && billing.testMode && (
          <section className="mt-6 rounded-2xl border border-(--v-line) bg-white p-6" aria-label="Sandbox payment confirmation">
            <h2 className="text-xl font-semibold">Successful sandbox subscription payment</h2>
            <p className="mt-2 text-sm text-(--v-grey)">Stripe confirmed the first payment. No real money was collected.</p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-(--v-grey)">Amount paid</dt><dd>{billing.amountPaid !== undefined ? new Intl.NumberFormat("en-IE", { style: "currency", currency: billing.currency || "eur" }).format(billing.amountPaid / 100) : "See Stripe transaction"}</dd></div>
              <div><dt className="text-(--v-grey)">Access outcome</dt><dd>{premium ? "Premium AI features unlocked" : "Payment recorded; Premium is no longer active"}</dd></div>
              <div className="min-w-0"><dt className="text-(--v-grey)">Subscription</dt><dd className="break-all">{billing.subscriptionId}</dd></div>
              <div className="min-w-0"><dt className="text-(--v-grey)">First invoice</dt><dd className="break-all">{billing.invoiceId || "See Stripe Checkout"}</dd></div>
              <div className="min-w-0 sm:col-span-2"><dt className="text-(--v-grey)">Checkout transaction</dt><dd className="break-all">{billing.checkoutSessionId}</dd></div>
            </dl>
          </section>
        )}
      </section>
    </SiteShell>
  );
}
