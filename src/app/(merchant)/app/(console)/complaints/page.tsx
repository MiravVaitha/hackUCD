import Link from "next/link";
import { PageHeader } from "@/components/console/page-header";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Textarea } from "@/components/ui/field";
import { CONSOLE_ROLES, requireUser } from "@/lib/auth/guards";
import { listComplaints } from "@/lib/complaints/service";
import { formatDateTime, sentenceCase } from "@/lib/utils";
import { createManualComplaint } from "./actions";

export const metadata = { title: "Complaints" };
export default async function ComplaintsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const session = await requireUser(CONSOLE_ROLES);
  const view = (await searchParams).view === "all" ? "all" : "open";
  const rows = await listComplaints(session.merchant.id, view);
  return <>
    <PageHeader title="Complaints" description="Listen to the customer. Check the record. Choose a fair resolution." />
    <nav className="mb-5 flex gap-4 text-sm"><Link className={view === "open" ? "font-bold text-signal-700" : ""} href="/app/complaints">Open cases</Link><Link className={view === "all" ? "font-bold text-signal-700" : ""} href="/app/complaints?view=all">All cases</Link><Link href="/store/help" target="_blank">Customer help form ↗</Link></nav>
    <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
      {rows.length ? rows.map(row => <Link key={row.id} href={`/app/complaints/${row.number}`} className="block p-5 transition hover:bg-paper">
        <div className="flex flex-wrap justify-between gap-2"><span className="font-mono text-xs text-ink-500">{row.number} · {row.orderNumber ?? "Needs order match"}</span><span className="text-xs font-medium text-signal-700">{sentenceCase(row.status)}</span></div>
        <h2 className="mt-2 font-semibold">{row.subject}</h2><p className="mt-2 text-sm text-ink-500">{row.customerName ?? row.customerEmail ?? "Customer"} · {formatDateTime(row.createdAt)} · {row.messageCount} messages</p>
      </Link>) : <div className="p-8"><h2 className="font-semibold">No {view === "open" ? "open " : ""}complaints</h2><p className="mt-2 text-sm text-ink-500">Cases from the help form appear here. You can also record a message below or load demo scenarios in Settings.</p></div>}
    </div>
    <details className="mt-6 rounded-xl border border-line bg-white p-5"><summary className="cursor-pointer font-semibold">Record a customer message</summary><div className="mt-5 max-w-2xl"><ActionForm action={createManualComplaint} submit="Create complaint">
      <Field label="Order number (optional)" htmlFor="orderNumber"><Input id="orderNumber" name="orderNumber" maxLength={40} /></Field>
      <Field label="Customer name" htmlFor="name"><Input id="name" name="name" maxLength={120} /></Field>
      <Field label="Customer email" htmlFor="email"><Input id="email" name="email" type="email" maxLength={200} /></Field>
      <Field label="Customer message" htmlFor="message"><Textarea id="message" name="message" minLength={5} maxLength={5000} required /></Field>
    </ActionForm></div></details>
  </>;
}
