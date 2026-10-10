import { Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { default: "Voltbox demo store", template: "%s · Voltbox" },
  description: "A fictional electronics store used to demonstrate ProofShield AI.",
};

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <p className="bg-ink-950 px-4 py-2 text-center text-xs text-ink-200">
        Demo store for{" "}
        <Link href="/" className="font-medium text-white underline underline-offset-2">
          ProofShield AI
        </Link>
        . Payments run in Stripe test mode, so no real money moves.
      </p>

      <header className="border-b border-ink-100">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-8">
          <Link href="/store" className="flex items-center gap-1.5" aria-label="Voltbox home">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-volt-400">
              <Zap className="h-5 w-5 fill-ink-950 text-ink-950" aria-hidden="true" />
            </span>
            <span className="text-xl font-semibold tracking-tight text-ink-950">voltbox</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/store" className="rounded-lg px-3 py-2 text-ink-700 hover:bg-ink-50">
              Shop
            </Link>
            <Link href="/store/help" className="rounded-lg px-3 py-2 text-ink-700 hover:bg-ink-50">
              Help with an order
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-ink-100">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-ink-500 sm:px-8">
          Voltbox is a fictional store. Its products, customers and orders are invented for this demo.
        </div>
      </footer>
    </div>
  );
}
