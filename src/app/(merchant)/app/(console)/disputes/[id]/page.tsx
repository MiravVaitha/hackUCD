import { latestAssessment } from "@/lib/disputes/assessment";
import { hasSubscription } from "@/lib/subscription";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { aiRuns } from "@/db/schema";
import { PageHeader } from "@/components/console/page-header";
import { ActionForm } from "@/components/ui/action-form";
import { CopyText } from "@/components/ui/copy-text";
import { Field, Textarea } from "@/components/ui/field";
import { CONSOLE_ROLES, requireUser } from "@/lib/auth/guards";
import { getDispute, latestResponse, isSimulatedDispute } from "@/lib/disputes/service";
import { getOrderRecordById } from "@/lib/orders/queries";
import { rebuttalSchema } from "@/lib/ai/schemas";
import { formatDateTime, formatMoney, sentenceCase } from "@/lib/utils";
import { disputeAction } from "../actions";

export const maxDuration = 180;
export const metadata = { title: "Evidence workspace" };
export default async function DisputeDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser(CONSOLE_ROLES);
  const dispute = await getDispute(session.merchant.id, (await params).id);
  if (!dispute) notFound();
  const record = await getOrderRecordById(session.merchant.id, dispute.orderId);
  if (!record) notFound();
  const premium = hasSubscription(session.merchant);
  const assessmentResult = await latestAssessment(session.merchant.id, dispute.id);
  const response = await latestResponse(dispute.id);
  const [run] = response?.aiRunId ? await db.select().from(aiRuns).where(eq(aiRuns.id, response.aiRunId)) : [];
  const sourceEvents = record.events.filter(event => event.type !== "dispute.evidence_prepared" && event.type !== "complaint.investigated");
  const assessmentStale = assessmentResult && sourceEvents.some(event => !assessmentResult.run.evidenceIds.includes(`E${event.seq}`));
  const draftStale = response && sourceEvents.some(event => !response.selectedEvidence.includes(event.seq));
  const parsed = rebuttalSchema.safeParse(run?.output);
  const ai = parsed.success ? parsed.data : null;
  const hidden = (operation: string) => <><input type="hidden" name="id" value={dispute.id} /><input type="hidden" name="operation" value={operation} /></>;
  return <><PageHeader title={`${record.order.number} · Evidence workspace`} description={`${sentenceCase(dispute.reason)} · ${formatMoney(dispute.amountMinor, dispute.currency)} · Due ${formatDateTime(dispute.evidenceDueBy)}`} back={{ href: "/app/disputes", label: "Disputes" }} />
    {!dispute.livemode && <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">{isSimulatedDispute(dispute) ? "Demo dispute. API records are simulated and exports are marked DEMO. No bank has been contacted." : "Stripe sandbox dispute. This is a test payment and exports are marked DEMO. No real bank submission is made."}</p>}
    <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
      <section className="space-y-5"><div className="space-y-4 rounded-xl border border-line bg-white p-5"><h2 className="text-lg font-semibold">Likelihood of winning · Premium</h2><p className="text-sm text-ink-500">OpenRouter weighs the available evidence and gaps. This is a subjective AI estimate, not a measured success rate or a bank decision.</p>{premium ? <ActionForm action={disputeAction} submit="Assess win likelihood" pending="Assessing the dispute…">{hidden("assess")}</ActionForm> : <Link href="/account" className="text-sm font-semibold text-signal-700 underline">Unlock AI assessment · €2.49/month</Link>}{assessmentResult && <div className="space-y-3 border-t border-line pt-4"><>{assessmentStale && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-ink-950">New evidence has been added since this assessment. Run it again to include the latest records.</p>}</><p className="font-display text-4xl">{assessmentResult.assessment.likelihood_percent === null ? "Insufficient evidence" : `${assessmentResult.assessment.likelihood_percent}%`}</p><p className="text-xs text-ink-500">AI estimate · {assessmentResult.assessment.confidence} confidence · {formatDateTime(assessmentResult.run.createdAt)}</p><p className="text-sm">{assessmentResult.assessment.explanation}</p><h3 className="text-sm font-semibold">Supporting evidence</h3>{assessmentResult.assessment.supporting_points.map((point, i) => <p key={i} className="text-sm">{point.statement} <span className="font-mono text-xs">{point.evidence_ids.join(", ")}</span></p>)}<h3 className="text-sm font-semibold">Weaknesses and next steps</h3><ul className="list-disc space-y-2 pl-5 text-sm">{[...assessmentResult.assessment.weaknesses, ...assessmentResult.assessment.next_steps].map((item, i) => <li key={i}>{item}</li>)}</ul><p className="text-xs text-ink-500">Model: {assessmentResult.run.model}. Saved snapshot; reassess after adding evidence. Not a guarantee of winning.</p></div>}</div><div className="rounded-xl border border-line bg-white p-5"><h2 className="mb-2 text-lg font-semibold">One record, ready to explain</h2><p className="mb-5 text-sm text-ink-500">OpenRouter compiles payment, packing, courier and conversation evidence into a bank-response draft. Review the wording and supporting records before using it.</p>{premium ? <ActionForm action={disputeAction} submit="Compile evidence with OpenRouter" pending="Compiling evidence — this may take a minute…">{hidden("compile")}</ActionForm> : <Link href="/account" className="text-sm font-semibold text-signal-700 underline">Upgrade to Premium for AI drafting · €2.49/month</Link>}<div className="mt-4"><ActionForm action={disputeAction} submit="Use template draft (no AI)" variant="secondary">{hidden("template")}</ActionForm></div><Link className="mt-5 block text-sm underline" href={`/app/orders/${record.order.number}`}>Inspect full order record →</Link></div>
      <div className="rounded-xl border border-line bg-white p-5"><h2 className="mb-4 font-semibold">Source evidence · {sourceEvents.length} entries</h2><ol className="space-y-4">{sourceEvents.map(e => <li key={e.id} className="border-l-2 border-line pl-3 text-sm"><p className="font-mono text-xs text-ink-500">E{e.seq} · {e.source} · {formatDateTime(e.occurredAt)}</p><p className="mt-1">{e.summary}</p></li>)}</ol></div>
      {ai && <div className="space-y-3 rounded-xl border border-line bg-white p-5 text-sm"><h2 className="font-semibold">AI assessment: {sentenceCase(ai.recommendation.decision)}</h2><p>{ai.recommendation.reasoning}</p><h3 className="font-semibold">Supported points</h3>{ai.rebuttal_points.map((point, i) => <p key={i}>{point.statement} <span className="font-mono text-xs text-seal-700">{point.evidence_ids.join(", ")}</span></p>)}<h3 className="font-semibold">Gaps and weaknesses</h3>{ai.weaknesses.map((weakness, i) => <p key={i}>{weakness.issue} {weakness.impact}</p>)}{run?.validation?.passed === false && <p className="rounded-lg bg-amber-50 p-3">Citation or wording checks flagged this draft. Check the claims against the evidence before exporting.</p>}<p className="text-xs text-ink-500">Generated with {run?.model}. Human review required.</p></div>}
      </section>
      <section className="space-y-5"><div className="rounded-xl border border-line bg-white p-5"><h2 className="mb-4 font-semibold">Review the bank response</h2><ActionForm key={response?.id ?? "new"} action={disputeAction} submit="Save reviewed text & rebuild PDF" pending="Building the evidence PDF…">{hidden("save")}<Field label="Response text" htmlFor="response"><Textarea id="response" name="response" rows={12} minLength={20} maxLength={10000} required defaultValue={response?.rebuttalText ?? ""} placeholder="Compile with OpenRouter, or write your own factual response here." /></Field></ActionForm></div>
      {response && <div className="space-y-4 rounded-xl border border-line bg-white p-5">{draftStale && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm">New evidence has been added since this PDF was generated. Review the response and rebuild the PDF before exporting.</p>}<h2 className="font-semibold">Export pack · version {response.version}</h2><p className="text-sm text-ink-500">Downloads contain the saved text above, source evidence, conversation and integrity report. Unsaved edits are not included.</p>{response.packetFileId && <a href={`/api/evidence/files/${response.packetFileId}`} download={`${record.order.number}-bank-evidence.pdf`} className="inline-flex rounded-lg bg-signal-600 px-4 py-3 text-sm font-semibold text-white">Download evidence PDF</a>}<CopyText text={response.fields.email ?? response.rebuttalText} /><p className="text-xs text-ink-500">Copy the text into an email and attach the PDF manually. Nothing is sent by Verity.</p></div>}
      </section>
    </div>
  </>;
}
