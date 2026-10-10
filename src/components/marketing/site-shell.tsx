import { ArrowRight, Menu } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { Logo } from "@/components/marketing/verity-logo";
import { cn } from "@/lib/utils";

/**
 * Verity palette, scoped to the public site through CSS variables on the shell
 * so nothing leaks into the merchant app or the Voltbox store.
 */
const PALETTE = {
  "--v-red": "#C92A2E",
  "--v-red-dark": "#8C1C13",
  "--v-egg": "#EFEAD5",
  "--v-egg-soft": "#F7F4E8",
  "--v-grey": "#495057",
  "--v-ink": "#212529",
  "--v-line": "#DCD5BC",
} as CSSProperties;

export const PREMIUM_PRICE = "€2.49";
/** Sign in, then land on the account page where Premium is an optional upgrade. */
export const UPGRADE_HREF = "/login?next=/account";

export type MarketingPage = "home" | "about" | "pricing";

const NAV: { key: MarketingPage; href: string; label: string }[] = [
  { key: "home", href: "/", label: "Home" },
  { key: "about", href: "/about", label: "About" },
  { key: "pricing", href: "/pricing", label: "Pricing" },
];

export function SiteShell({
  current,
  signedIn = false,
  children,
}: {
  current?: MarketingPage;
  /** Swaps "Business login" for a link back to the dashboard. */
  signedIn?: boolean;
  children: ReactNode;
}) {
  const action = signedIn
    ? { href: "/app", label: "Dashboard" }
    : { href: "/login", label: "Business login" };

  return (
    <div
      style={PALETTE}
      className="flex min-h-screen flex-col bg-(--v-egg) text-(--v-ink) selection:bg-(--v-red) selection:text-white"
    >
      <header className="sticky top-0 z-30 border-b border-(--v-line) bg-(--v-egg)/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
          <Link href="/" aria-label="Verity home" className="rounded-md">
            <Logo />
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={item.key === current ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  item.key === current
                    ? "text-(--v-red-dark)"
                    : "text-(--v-grey) hover:bg-(--v-ink)/5 hover:text-(--v-ink)",
                )}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href={action.href}
              className="ml-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-(--v-ink) px-4 text-sm font-medium text-white transition-colors hover:bg-(--v-red-dark)"
            >
              {action.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </nav>

          {/* Small screens: a native disclosure, so the menu works without client JavaScript. */}
          <details className="relative md:hidden">
            <summary
              className="flex h-10 w-10 list-none items-center justify-center rounded-lg border border-(--v-line) bg-(--v-egg-soft) text-(--v-ink) [&::-webkit-details-marker]:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </summary>
            <nav
              aria-label="Main"
              className="absolute right-0 mt-2 w-56 rounded-xl border border-(--v-line) bg-(--v-egg-soft) p-2 shadow-[0_12px_32px_-8px_rgb(33_37_41/0.25)]"
            >
              {NAV.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={item.key === current ? "page" : undefined}
                  className={cn(
                    "block rounded-lg px-3 py-2.5 text-[15px] font-medium",
                    item.key === current ? "bg-(--v-red)/10 text-(--v-red-dark)" : "text-(--v-ink)",
                  )}
                >
                  {item.label}
                </Link>
              ))}
              <Link
                href={action.href}
                className="mt-1 flex items-center justify-between rounded-lg bg-(--v-ink) px-3 py-2.5 text-[15px] font-medium text-white"
              >
                {action.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </nav>
          </details>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-(--v-line)">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-(--v-grey) sm:px-8 md:flex-row md:items-center md:justify-between">
          <Logo />
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
            {NAV.map((item) => (
              <Link key={item.key} href={item.href} className="hover:text-(--v-red-dark)">
                {item.label}
              </Link>
            ))}
            <Link href="/store" className="hover:text-(--v-red-dark)">
              Voltbox demo shop
            </Link>
          </nav>
        </div>
        <p className="mx-auto w-full max-w-6xl px-4 pb-8 text-xs leading-relaxed text-(--v-grey)/80 sm:px-8">
          Hackathon demo. Voltbox and its customers are fictional, connectors are simulated and
          Premium checkout runs in Stripe test mode. AI estimates are not guaranteed outcomes.
        </p>
      </footer>
    </div>
  );
}

/** Small uppercase label above a section heading. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "text-xs font-semibold tracking-[0.14em] text-(--v-red-dark) uppercase",
        className,
      )}
    >
      {children}
    </p>
  );
}

const ctaBase =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-medium whitespace-nowrap transition-colors";

export function PrimaryCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={cn(ctaBase, "bg-(--v-red) text-white hover:bg-(--v-red-dark)")}>
      {children}
    </Link>
  );
}

export function SecondaryCta({
  href,
  children,
  inverted = false,
}: {
  href: string;
  children: ReactNode;
  inverted?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        ctaBase,
        inverted
          ? "border border-white/25 text-white hover:bg-white/10"
          : "border border-(--v-ink)/15 bg-white/60 text-(--v-ink) hover:border-(--v-ink)/35",
      )}
    >
      {children}
    </Link>
  );
}

/** Dark closing band. */
export function ClosingCta() {
  return (
    <section className="px-4 pb-16 sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-8 rounded-3xl bg-(--v-ink) px-6 py-12 text-white sm:px-12 md:grid-cols-[1.5fr_1fr] md:items-end">
        <div>
          <h2 className="font-display text-4xl leading-tight text-balance sm:text-5xl">
            Start free. Add AI when you need it.
          </h2>
          <p className="mt-4 max-w-lg text-white/70">
            Your dashboard, orders, complaints and evidence exports are free. Premium adds AI
            analysis and drafting for {PREMIUM_PRICE} a month.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 md:justify-end">
          <PrimaryCta href="/login">
            Start free <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </PrimaryCta>
          <SecondaryCta href="/pricing" inverted>
            Compare plans
          </SecondaryCta>
        </div>
      </div>
    </section>
  );
}
