import { hasSubscription } from "@/lib/subscription";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/console/page-header";
import { Conversation } from "@/components/complaints/thread";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { CONSOLE_ROLES, requireUser } from "@/lib/auth/guards";
import { getComplaintThread } from "@/lib/complaints/service";
import { getLatestInvestigation } from "@/lib/ai/investigate";
import { investigationSchema } from "@/lib/ai/schemas";
import { sentenceCase } from "@/lib/utils";
import { complaintAction } from "../actions";
import { disputeAction } from "../../disputes/actions";
import { env } from "@/lib/env";

export const metadata = { title: "Complaint review" };
export const maxDuration = 180;
export default async function ComplaintDetail({ params }: { params: Promise<{ number: string }> }) {
  const session = await requireUser(CONSOLE_ROLES);
  const thread = await getComplaintThread(session.merchant.id, (await params).number);
  if (!thread) notFound();
  const { complaint, order, messages } = thread;
  const run = await getLatestInvestigation(complaint.id);
  const parsed = investigationSchema.safeParse(run?.output);
  const ai = run?.status === "succeeded" && parsed.success ? parsed.data : null;
  const hidden = (operation: string) => <><input type="hidden" name="id" value={complaint.id} /><input type="hidden" name="operation" value={operation} /></>;
  const panel = "rounded-xl border border-line bg-white p-5 space-y-4";
  return <>
    <Link href="/app/complaints" className="text-sm text-ink-500">← Complaints</Link>
    <PageHeader title={`${complaint.number} · ${complaint.subject}`} description={`${complaint.customerName ?? "Customer"} · ${sentenceCase(complaint.status)}`} />
    <div className="mb-6 flex flex-wrap gap-4 text-sm"><Link className="underline" href={`/store/help/${complaint.publicToken}`} target="_blank">Open customer case ↗</Link>{order && <Link className="underline" href={`/app/orders/${order.number}`}>Evidence record · {order.number}</Link>}</div>
    <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
      <section className="space-y-6"><h2 className="text-lg font-semibold">Conversation</h2><Conversation messages={messages} />
        <div className={panel}><h2 className="font-semibold">Reply to the customer</h2><p className="text-sm text-ink-500">Replies appear on the private case page. No email is sent.</p><ActionForm key={run?.id ?? "manual"} action={complaintAction} submit="Publish reviewed reply">{hidden("reply")}{ai && <input type="hidden" name="aiRunId" value={run!.id} />}<Field label="Reply" htmlFor="reply"><Textarea id="reply" name="message" rows={7} defaultValue={ai?.customer_reply.body ?? ""} required minLength={2} maxLength={5000} /></Field></ActionForm></div>
        <details className={panel}><summary className="cursor-pointer font-semibold">Internal note</summary><ActionForm action={complaintAction} submit="Save note">{hidden("note")}<Field label="Note (merchant only)" htmlFor="internal"><Textarea id="internal" name="message" required minLength={2} maxLength={5000} /></Field></ActionForm></details>
      </section>
      <section className="space-y-5">
        {!order && <div className={panel}><h2 className="font-semibold">Match an order</h2><ActionForm action={complaintAction} submit="Link order">{hidden("link")}<Field label="Order number" htmlFor="orderNumber"><Input id="orderNumber" name="orderNumber" required maxLength={40} /></Field></ActionForm></div>}
        {order && <div className={panel}><h2 className="font-semibold">Evidence assistant</h2><p className="text-sm text-ink-500">Checks the order record, identifies gaps and drafts a reply. You make the decision.</p>{hasSubscription(session.merchant) ? <ActionForm action={complaintAction} submit={ai ? "Run a fresh investigation" : "Investigate with AI"} pending="Reading the evidence…">{hidden("investigate")}</ActionForm> : <Link href="/account" className="text-sm font-semibold text-signal-700 underline">Unlock AI investigations with Premium</Link>}
          {run?.status === "failed" && <p role="alert" className="text-sm text-signal-700">{run.error}</p>}
          {ai && <div className="space-y-4 text-sm"><p>{ai.claim_summary}</p><p className="rounded-lg bg-paper p-3"><strong>{sentenceCase(ai.evidence_position.position)}.</strong> {ai.evidence_position.explanation}</p>
            <h3 className="font-semibold">What the records support</h3><ul className="space-y-3">{ai.verified_facts.map((fact, i) => <li key={i}>{fact.statement}<span className="ml-2 font-mono text-xs text-seal-700">{fact.evidence_ids.join(", ")}</span></li>)}</ul>
            <h3 className="font-semibold">What we cannot verify</h3><ul className="space-y-3">{ai.cannot_verify.map((fact, i) => <li key={i}>{fact.statement} <span className="text-ink-500">{fact.why}</span></li>)}</ul>
            <h3 className="font-semibold">Suggested next step · {sentenceCase(ai.suggested_resolution.action)}</h3><p>{ai.suggested_resolution.rationale}</p>
            {run?.validation?.passed === false && <p className="rounded-lg bg-amber-50 p-3">Some AI statements failed citation or wording checks. Review every claim before using the draft.</p>}
            <p className="text-xs text-ink-500">Model: {run?.model}. AI suggestions are not decisions.</p>
          </div>}
        </div>}
        {complaint.status !== "escalated" && <div className={panel}><h2 className="font-semibold">Resolve the case</h2><ActionForm action={complaintAction} submit="Mark resolved">{hidden("resolve")}<Field label="Outcome" htmlFor="resolution"><Select id="resolution" name="resolution">{["clarified", "refunded", "partially_refunded", "replacement_sent", "declined", "other"].map(value => <option key={value} value={value}>{sentenceCase(value)}</option>)}</Select></Field><Field label="Resolution note" htmlFor="resolutionNote"><Textarea id="resolutionNote" name="note" maxLength={1000} /></Field></ActionForm></div>}
        {order && complaint.status !== "escalated" && <details className={panel}><summary className="cursor-pointer font-semibold">Refund or replacement</summary><ActionForm action={complaintAction} submit={order.simulated ? "Record simulated refund" : "Issue refund"} variant="danger">{hidden("refund")}<Field label={`Refund amount in ${order.currency.toUpperCase()} (blank for full remaining amount)`} htmlFor="amount"><Input id="amount" name="amount" type="number" min="0.01" step="0.01" /></Field><Field label="Refund note" htmlFor="refundNote"><Input id="refundNote" name="note" maxLength={300} /></Field><label className="flex gap-2 text-sm"><input type="checkbox" name="confirm" required />I approve this refund to the original payment method.</label></ActionForm><hr className="border-line" /><ActionForm action={complaintAction} submit="Record replacement">{hidden("replacement")}<Field label="What replacement was arranged?" htmlFor="replacement"><Textarea id="replacement" name="message" required minLength={3} maxLength={500} /></Field></ActionForm></details>}
        {order && (order.simulated || (order.source === "demo_store" && order.paidAt)) && env.demoMode && complaint.status !== "escalated" && <details className={panel}><summary className="cursor-pointer font-semibold">Demo: escalate to a chargeback</summary><p className="text-sm text-ink-500">Creates a simulated dispute for a sample or paid Stripe test order. Live payments are excluded. No bank is contacted.</p><ActionForm action={disputeAction} submit="Create simulated dispute"><input type="hidden" name="operation" value="simulate" /><input type="hidden" name="orderId" value={order.id} /></ActionForm></details>}
      </section>
    </div>
  </>;
}
