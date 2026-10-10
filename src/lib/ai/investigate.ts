import { and, desc, eq, gt } from "drizzle-orm";

import { db } from "@/db/client";
import { aiRuns, complaints, type AiRun } from "@/db/schema";
import type { SessionContext } from "@/lib/auth/session";
import { getComplaintThreadById } from "@/lib/complaints/service";
import { buildEvidenceBundle } from "@/lib/evidence/bundle";
import { appendLedgerEvent } from "@/lib/ledger/append";
import { getCustomerHistory } from "@/lib/orders/history";
import { getOrderRecordById } from "@/lib/orders/queries";
import {
  buildReport,
  checkCitations,
  cleanIds,
  findAccusatoryWording,
  findUnsupportedSpecifics,
  type GroundingReport,
} from "./grounding";
import { AiError, completeStructured, type StructuredCompletion } from "./openrouter";
import { INVESTIGATION_PROMPT_VERSION, INVESTIGATION_SYSTEM_PROMPT, investigationUserPrompt } from "./prompts";
import { investigationJsonSchema, investigationSchema, type Investigation } from "./schemas";

export class InvestigationError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "InvestigationError";
  }
}

/**
 * Apply the grounding checks to a raw investigation. Citations that point at
 * nothing are removed, statements left without a source are moved to "cannot
 * verify", and the reply draft is checked for accusatory wording and for
 * details that are not in the evidence.
 */
export function groundInvestigation(
  raw: Investigation,
  bundle: { text: string; ids: string[] },
): { investigation: Investigation; report: GroundingReport } {
  const validIds = new Set(bundle.ids);
  const facts = checkCitations(raw.verified_facts, validIds);
  const inconsistencies = checkCitations(raw.inconsistencies, validIds);
  const resolutionIds = cleanIds(raw.suggested_resolution.evidence_ids, validIds);

  const demoted = [...facts.uncited, ...inconsistencies.uncited].map((item) => ({
    statement: item.statement,
    why: "The assistant did not point to a record that supports this, so it is not treated as verified.",
  }));

  const replyText = `${raw.customer_reply.subject}\n${raw.customer_reply.body}`;
  const report = buildReport({
    statementsChecked: raw.verified_facts.length + raw.inconsistencies.length,
    invalidCitations: [...facts.invalid, ...inconsistencies.invalid, ...resolutionIds.invalid],
    uncitedStatements: demoted.length,
    wordingFlags: findAccusatoryWording(replyText),
    unsupportedSpecifics: findUnsupportedSpecifics(replyText, bundle.text),
  });

  return {
    investigation: {
      ...raw,
      verified_facts: facts.cited,
      inconsistencies: inconsistencies.cited,
      cannot_verify: [...raw.cannot_verify, ...demoted],
      suggested_resolution: { ...raw.suggested_resolution, evidence_ids: resolutionIds.kept },
    },
    report,
  };
}

/** The most recent investigation for a complaint, whatever its status. */
export async function getLatestInvestigation(complaintId: string): Promise<AiRun | null> {
  const [run] = await db
    .select()
    .from(aiRuns)
    .where(and(eq(aiRuns.subjectType, "complaint"), eq(aiRuns.subjectId, complaintId), eq(aiRuns.kind, "investigation")))
    .orderBy(desc(aiRuns.createdAt))
    .limit(1);
  return run ?? null;
}

/**
 * Investigate a complaint against its order's evidence record. Runs inside the
 * request that asked for it and stores everything about the run: the model,
 * the prompt version, the evidence shown, the answer and the checks on it.
 */
export async function runInvestigation(
  context: SessionContext,
  complaintId: string,
  complete: StructuredCompletion = completeStructured,
): Promise<AiRun> {
  const merchant = context.merchant;
  const thread = await getComplaintThreadById(merchant.id, complaintId);
  if (!thread) throw new InvestigationError("That complaint could not be found.", 404);
  if (!thread.complaint.orderId) {
    throw new InvestigationError("Link this complaint to an order first. The investigation works from the order's records.", 409);
  }

  // One investigation at a time per complaint.
  const [running] = await db
    .select()
    .from(aiRuns)
    .where(
      and(
        eq(aiRuns.subjectType, "complaint"),
        eq(aiRuns.subjectId, complaintId),
        eq(aiRuns.status, "running"),
        gt(aiRuns.createdAt, new Date(Date.now() - 3 * 60 * 1000)),
      ),
    )
    .limit(1);
  if (running) throw new InvestigationError("An investigation is already running for this complaint.", 409);

  const record = await getOrderRecordById(merchant.id, thread.complaint.orderId);
  if (!record) throw new InvestigationError("The order for this complaint could not be loaded.", 404);
  const history = await getCustomerHistory(merchant.id, record.order.customerEmail, record.order);
  const bundle = buildEvidenceBundle({
    merchant,
    record,
    history,
    complaint: thread.complaint,
    messages: thread.messages,
  });

  const [run] = await db
    .insert(aiRuns)
    .values({
      merchantId: merchant.id,
      orderId: record.order.id,
      subjectType: "complaint",
      subjectId: complaintId,
      kind: "investigation",
      model: process.env.OPENROUTER_MODEL?.trim() || "anthropic/claude-sonnet-5.5",
      promptVersion: INVESTIGATION_PROMPT_VERSION,
      status: "running",
      evidenceIds: bundle.ids,
      createdByUserId: context.user.id,
    })
    .returning();

  try {
    const response = await complete({
      system: INVESTIGATION_SYSTEM_PROMPT,
      user: investigationUserPrompt({
        evidence: bundle.text,
        complaintNumber: thread.complaint.number,
        signature: merchant.settings.supportSignature ?? `${merchant.name} Customer Care`,
        currency: record.order.currency,
      }),
      schemaName: "complaint_investigation",
      schema: investigationJsonSchema,
    });

    const parsed = investigationSchema.safeParse(response.data);
    if (!parsed.success) {
      throw new AiError("The AI's answer did not have the expected shape. Try again.", "invalid_output");
    }
    const { investigation, report } = groundInvestigation(parsed.data, bundle);

    const [finished] = await db
      .update(aiRuns)
      .set({
        status: "succeeded",
        model: response.model,
        output: investigation,
        validation: report,
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
        costUsd: response.costUsd !== null ? response.costUsd.toFixed(6) : null,
        latencyMs: response.latencyMs,
      })
      .where(eq(aiRuns.id, run.id))
      .returning();

    await db
      .update(complaints)
      .set({
        category: investigation.category,
        status: thread.complaint.status === "new" ? "investigating" : thread.complaint.status,
        updatedAt: new Date(),
      })
      .where(eq(complaints.id, complaintId));

    await appendLedgerEvent({
      merchantId: merchant.id,
      orderId: record.order.id,
      type: "complaint.investigated",
      actor: { type: "ai", label: "AI assistant" },
      source: "ai",
      sourceRef: run.id,
      summary:
        `AI investigation of complaint ${thread.complaint.number}, requested by ${context.user.name}: ` +
        `${investigation.verified_facts.length} statement${investigation.verified_facts.length === 1 ? "" : "s"} ` +
        `tied to records, ${investigation.cannot_verify.length} that the records cannot settle. ` +
        `Suggested action: ${investigation.suggested_resolution.action.replace(/_/g, " ")}. ` +
        "A person makes the decision.",
      payload: {
        aiRunId: run.id,
        complaintNumber: thread.complaint.number,
        model: response.model,
        promptVersion: INVESTIGATION_PROMPT_VERSION,
        category: investigation.category,
        evidencePosition: investigation.evidence_position.position,
        suggestedAction: investigation.suggested_resolution.action,
        citedEvidence: [...new Set(investigation.verified_facts.flatMap((fact) => fact.evidence_ids))],
        groundingPassed: report.passed,
        requestedBy: context.user.name,
      },
    });

    return finished;
  } catch (error) {
    const message = error instanceof AiError ? error.message : "The investigation could not be completed.";
    if (!(error instanceof AiError)) {
      console.error("[investigation] failed:", error instanceof Error ? error.message : error);
    }
    await db.update(aiRuns).set({ status: "failed", error: message }).where(eq(aiRuns.id, run.id));
    throw new InvestigationError(message, error instanceof AiError && error.kind === "not_configured" ? 503 : 502);
  }
}
