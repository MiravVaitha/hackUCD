import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { SetupNotice } from "@/components/setup-notice";
import { homeForRole } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { DEMO_USERS } from "@/lib/catalog";
import { isDatabaseConfigured } from "@/lib/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner: "Everything, including settings and demo controls",
  agent: "Orders, complaints and disputes",
  packer: "The packing station only",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : null;

  if (isDatabaseConfigured()) {
    const session = await getSession();
    if (session) redirect(homeForRole(session.user.role));
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <aside className="ledger-rules hidden flex-col justify-between bg-ink-950 p-10 text-white lg:flex">
        <Link href="/" aria-label="ProofShield home">
          <Logo tone="light" />
        </Link>
        <div>
          <p className="font-display text-4xl leading-tight text-balance">
            What was paid for, what was packed, what was delivered.
          </p>
          <p className="mt-4 max-w-sm text-ink-300">
            One record per order, used to resolve complaints and to respond to chargebacks.
          </p>
        </div>
        <p className="text-sm text-ink-400">Demo environment · fictional data · Stripe test mode</p>
      </aside>

      <main className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <Link href="/" className="lg:hidden" aria-label="ProofShield home">
            <Logo />
          </Link>
          <h1 className="mt-8 text-2xl font-semibold tracking-tight text-ink-950 lg:mt-0">
            Sign in to the merchant app
          </h1>
          <p className="mt-1 text-sm text-ink-500">Voltbox demo workspace</p>

          <SetupNotice className="mt-6" />

          <div className="mt-6">
            <LoginForm next={next} />
          </div>

          <div className="mt-8 rounded-xl border border-line bg-white p-4">
            <p className="text-sm font-medium text-ink-900">Demo accounts</p>
            <p className="mt-0.5 text-sm text-ink-500">
              All three share the demo password. Ask the team for it.
            </p>
            <ul className="mt-3 space-y-2">
              {DEMO_USERS.map((user) => (
                <li key={user.email} className="text-sm">
                  <span className="font-mono text-[13px] text-ink-900">{user.email}</span>
                  <span className="block text-ink-500">{ROLE_DESCRIPTIONS[user.role]}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
