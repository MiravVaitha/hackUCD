import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { ArrowUpRight, ShoppingBag, CreditCard, PackageCheck, Truck, Mail, Landmark } from "lucide-react";
import { db } from "@/db/client";
import { accessLogs, ledgerEvents, orders, complaints, disputes } from "@/db/schema";
import { PageHeader } from "@/components/console/page-header";
import { SyncDemo } from "@/components/console/sync-demo";
import { CONSOLE_ROLES, requireUser } from "@/lib/auth/guards";
import { DEMO_SOURCES } from "@/lib/demo/sync";
import { env } from "@/lib/env";
import { formatDateTime, formatMoney, sentenceCase } from "@/lib/utils";
import { listDisputes } from "@/lib/disputes/service";

export async function Dashboard() {
  const session = await requireUser(CONSOLE_ROLES);
  const merchantId = session.merchant.id;
  const [orderStats, complaintStats, disputeStats, logs, events, cases] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int`, value: sql<number>`coalesce(sum(${orders.totalMinor}),0)::int` }).from(orders).where(and(eq(orders.merchantId, merchantId), sql`${orders.paymentStatus} not in ('pending','failed')`)),
    db.select({ count: sql<number>`count(*)::int` }).from(complaints).where(and(eq(complaints.merchantId, merchantId), sql`${complaints.status} not in ('resolved','escalated')`)),
    db.select({ count: sql<number>`count(*)::int`, value: sql<number>`coalesce(sum(${disputes.amountMinor}),0)::int` }).from(disputes).where(and(eq(disputes.merchantId, merchantId), eq(disputes.held, false), sql`${disputes.outcome} is null`)),
    db.select().from(accessLogs).where(and(eq(accessLogs.merchantId, merchantId), eq(accessLogs.action, "demo_api_sync"))).orderBy(desc(accessLogs.at)).limit(6),
    db.select({ event: ledgerEvents, number: orders.number }).from(ledgerEvents).innerJoin(orders, eq(orders.id, ledgerEvents.orderId)).where(eq(ledgerEvents.merchantId, merchantId)).orderBy(desc(ledgerEvents.recordedAt)).limit(10),
    listDisputes(merchantId),
  ]);
  const icons = [ShoppingBag, CreditCard, PackageCheck, Truck, Mail, Landmark];
  const stats = [ { label: "Orders in one place", value: String(orderStats[0].count), href: "/app/orders" }, { label: "Order value · includes demo", value: formatMoney(orderStats[0].value, "eur"), href: "/app/orders" }, { label: "Open complaints", value: String(complaintStats[0].count), href: "/app/complaints" }, { label: "Disputed amount", value: formatMoney(disputeStats[0].value, "eur"), href: "/app/disputes" } ];
  return <>
    <PageHeader title="Your evidence, all together." description={`${session.merchant.name} workspace · From scattered records to a response you can stand behind.`} actions={env.demoMode ? <SyncDemo /> : undefined} />
    <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map(s => <Link key={s.label} href={s.href} className="rounded-xl border border-line bg-white p-5 shadow-card"><div className="flex items-center justify-between gap-2 text-xs text-ink-500">{s.label}<ArrowUpRight className="h-4 w-4" /></div><p className="mt-4 font-display text-4xl">{s.value}</p></Link>)}</div>
    <section className="mb-7 rounded-2xl bg-ink-950 p-6 text-white"><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Connected evidence sources</h2><p className="mt-1 text-sm text-ink-300">A demo of pulling API records into one order timeline.</p></div><span className="rounded-full border border-white/25 px-3 py-1 text-xs">SIMULATED CONNECTORS</span></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{DEMO_SOURCES.map((source, index) => { const log = logs.find(l => l.targetType === source.key); const Icon = icons[index]; return <div key={source.key} className="rounded-xl border border-white/15 bg-white/5 p-4"><div className="flex items-center gap-3"><Icon className="h-5 w-5 text-[#EFEAD5]" /><h3 className="font-semibold">{source.name}</h3><span className="ml-auto text-[11px] text-ink-300">{log ? "SYNCED" : "READY"}</span></div><p className="mt-2 text-xs text-ink-300">{source.detail}</p><p className="mt-3 text-xs text-ink-300">{log ? `${source.count} sample records · ${formatDateTime(log.at)}` : "Run a demo sync to import records"}</p></div>; })}</div>
      <p className="mt-4 text-xs text-ink-300">Fixtures simulate API responses; these cards do not claim live Shopify, courier, support or bank connections. Existing Stripe checkout remains separate.</p>
    </section>
    <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
      <section className="rounded-xl border border-line bg-white p-5"><div className="mb-5 flex justify-between"><h2 className="font-semibold">Ready for an evidence pack</h2><Link className="text-sm underline" href="/app/disputes">View all</Link></div>{cases.length ? cases.slice(0, 5).map(({ dispute, orderNumber }) => <Link key={dispute.id} href={`/app/disputes/${dispute.id}`} className="mb-3 block rounded-xl border border-line p-4 hover:bg-paper"><div className="flex justify-between gap-2"><span className="font-semibold">{orderNumber}</span><span>{formatMoney(dispute.amountMinor, dispute.currency)}</span></div><p className="mt-1 text-sm text-ink-500">{sentenceCase(dispute.reason)}</p><p className="mt-3 text-xs text-signal-700">Compile with OpenRouter → review → export email + PDF</p></Link>) : <p className="py-8 text-sm text-ink-500">Sync the demo APIs to load a delivery dispute with payment, packing, courier and customer-message evidence.</p>}</section>
      <section className="rounded-xl border border-line bg-white p-5"><h2 className="mb-5 font-semibold">Latest evidence activity</h2>{events.length ? <ol className="space-y-4">{events.map(({ event, number }) => <li key={event.id} className="border-l-2 border-line pl-3"><Link href={`/app/orders/${number}`} className="text-xs font-semibold text-signal-700">{number} · {event.source}{event.simulated ? " · simulated" : ""}</Link><p className="mt-1 text-sm">{event.summary}</p><p className="mt-1 text-xs text-ink-500">{formatDateTime(event.recordedAt)}</p></li>)}</ol> : <p className="py-8 text-sm text-ink-500">Imported events will appear here with their source and timestamp.</p>}</section>
    </div>
  </>;
}
