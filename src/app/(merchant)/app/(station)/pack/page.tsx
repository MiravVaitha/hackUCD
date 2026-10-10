import { Camera, ChevronRight, LayoutDashboard, LogOut, QrCode, ScanBarcode, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { logoutAction } from "@/app/login/actions";
import { Logo } from "@/components/brand/logo";
import { LiveRefresh } from "@/components/console/live-refresh";
import { requireUser } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { listPackQueue, listRecentlyPacked } from "@/lib/packing/service";
import { formatRelative, formatTime } from "@/lib/utils";
import { handoverAction, openOrderAction } from "./actions";

export const metadata: Metadata = { title: "Packing station" };

export default async function PackingQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ notfound?: string; problem?: string }>;
}) {
  const session = await requireUser();
  const params = await searchParams;
  const [queue, packed] = await Promise.all([
    listPackQueue(session.merchant.id),
    listRecentlyPacked(session.merchant.id),
  ]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <Logo tone="light" />
        <div className="flex items-center gap-1">
          {session.user.role !== "packer" ? (
            <Link href="/app" className="flex h-10 items-center gap-1.5 rounded-full px-3 text-sm text-ink-200 hover:bg-white/10">
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" /> Console
            </Link>
          ) : null}
          <form action={logoutAction}>
            <button type="submit" className="flex h-10 items-center gap-1.5 rounded-full px-3 text-sm text-ink-200 hover:bg-white/10">
              <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="mt-6">
        <h1 className="text-2xl font-semibold">Packing station</h1>
        <p className="text-sm text-ink-300">Signed in as {session.user.name}</p>
      </div>

      <Link
        href="/app/pack/scan"
        className="mt-5 flex h-16 items-center justify-center gap-3 rounded-2xl bg-white text-lg font-semibold text-ink-950"
      >
        <ScanBarcode className="h-6 w-6" aria-hidden="true" /> Scan a packing slip
      </Link>

      <form action={openOrderAction} className="mt-3 flex gap-2">
        <label htmlFor="order" className="sr-only">
          Order number
        </label>
        <input
          id="order"
          name="order"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="Or type an order number"
          className="h-12 min-w-0 flex-1 rounded-xl border border-white/15 bg-ink-900 px-4 font-mono text-base text-white placeholder:font-sans placeholder:text-ink-500 focus:border-white focus:outline-none"
        />
        <button type="submit" className="h-12 rounded-xl bg-white/10 px-5 text-sm font-medium">
          Open
        </button>
      </form>
      {params.notfound ? (
        <p className="mt-2 text-sm text-amber-200" role="alert">
          No order matches &ldquo;{params.notfound}&rdquo;.
        </p>
      ) : null}
      {params.problem ? (
        <p className="mt-2 text-sm text-amber-200" role="alert">
          {params.problem}
        </p>
      ) : null}

      <section className="mt-8">
        <h2 className="text-sm font-semibold tracking-wide text-ink-300 uppercase">Ready to pack ({queue.length})</h2>
        {queue.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-ink-900 px-4 py-6 text-center text-sm text-ink-300">
            Nothing is waiting. New paid orders appear here by themselves.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {queue.map(({ order, units, lines, inProgress }) => (
              <li key={order.id}>
                <Link
                  href={`/app/pack/${order.number}`}
                  prefetch={false}
                  className="flex items-center gap-3 rounded-2xl bg-ink-900 px-4 py-3.5 transition-colors hover:bg-ink-800"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2">
                      <span className="font-mono text-lg font-semibold">{order.number}</span>
                      {inProgress ? (
                        <span className="rounded-full bg-transit-600 px-2 py-0.5 text-[11px] font-medium">Started</span>
                      ) : null}
                    </p>
                    <p className="truncate text-sm text-ink-300">
                      {units} unit{units === 1 ? "" : "s"}
                      {lines > 1 ? `, ${lines} products` : ""} · {order.customerName ?? "Customer"}
                    </p>
                    <p className="truncate text-xs text-ink-400">
                      Paid {formatRelative(order.paidAt ?? order.placedAt)}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-ink-400" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {packed.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold tracking-wide text-ink-300 uppercase">
            Packed, waiting for the courier ({packed.length})
          </h2>
          <ul className="mt-3 space-y-2">
            {packed.map((order) => (
              <li key={order.id} className="flex items-center gap-3 rounded-2xl bg-ink-900 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-base font-semibold">{order.number}</p>
                  <p className="truncate text-sm text-ink-300">
                    {order.customerName ?? "Customer"}
                    {order.packedAt ? ` · packed ${formatTime(order.packedAt).slice(0, 5)}` : ""}
                  </p>
                </div>
                <form action={handoverAction}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <button type="submit" className="flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-4 text-sm font-medium hover:bg-white/15">
                    <Truck className="h-4 w-4" aria-hidden="true" /> Handed over
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-auto space-y-3 pt-10">
        {env.demoMode ? (
          <Link
            href="/app/pack/barcodes"
            target="_blank"
            className="flex items-center gap-3 rounded-2xl border border-dashed border-ink-600 px-4 py-3 text-sm text-ink-200"
          >
            <QrCode className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>
              Demo barcodes
              <span className="block text-ink-400">Open on another screen and scan them as if they were products.</span>
            </span>
          </Link>
        ) : null}
        <p className="flex items-start gap-2 text-xs text-ink-400">
          <Camera className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          This station photographs parcels as order evidence. Photos are stored with the order and show the packing
          bench only. Keep people out of the frame.
        </p>
      </div>

      <LiveRefresh />
    </div>
  );
}
