import type Stripe from "stripe";
import { syncDispute } from "@/lib/stripe/disputes";
import { importDeliveryEmail } from "@/lib/delivery/import-email";
import { assessDispute, latestAssessment } from "@/lib/disputes/assessment";
import { ledgerEvents, payments } from "@/db/schema";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { db } from "@/db/client";
import { merchants, users, products, orders, complaints } from "@/db/schema";
import type { SessionContext } from "@/lib/auth/session";
import { syncDemoData } from "@/lib/demo/sync";
import { purgeOrders } from "@/lib/demo/purge";
import { simulateDispute, compileEvidence, getDispute, listDisputes, saveEvidenceDraft } from "@/lib/disputes/service";
import { readEvidenceBytes } from "@/lib/evidence/files";
import { verifyOrderLedger } from "@/lib/ledger/verify";
import { addInternalNote, getComplaintThreadByToken } from "@/lib/complaints/service";

describe("demo API imports and exportable evidence", () => {
  let context: SessionContext;
  beforeAll(async () => {
    const suffix = randomUUID();
    const [merchant] = await db.insert(merchants).values({ slug: `test-${suffix}`, name: "Test merchant", settings: { orderPrefix: "TEST" } }).returning();
    const [user] = await db.insert(users).values({ merchantId: merchant.id, name: "Test owner", email: `${suffix}@example.test`, role: "owner", passwordHash: "not-a-login-hash" }).returning();
    context = { merchant, user, sessionId: suffix };
    await db.insert(products).values(Array.from({ length: 4 }, (_, i) => ({ merchantId: merchant.id, sku: `TEST-${i}`, barcode: `123456789012${i}`, name: `Demo item ${i}`, priceMinor: 1000, sortOrder: i })));
  });
  afterAll(async () => {
    if (!context) return;
    const rows = await db.select().from(orders).where(eq(orders.merchantId, context.merchant.id));
    await purgeOrders(rows.map(o => o.id));
    await db.delete(merchants).where(eq(merchants.id, context.merchant.id));
  });
  it("imports six sources and replays without duplicating orders", async () => {
    expect((await syncDemoData(context)).added).toBe(4);
    expect((await syncDemoData(context)).added).toBe(0);
    const rows = await db.select().from(orders).where(eq(orders.merchantId, context.merchant.id));
    expect(rows).toHaveLength(4);
    for (const order of rows) expect((await verifyOrderLedger(order.id, context.merchant.id))?.ok).toBe(true);
  });
  it("keeps disputes scoped to the merchant", async () => {
    const [{ dispute }] = await listDisputes(context.merchant.id);
    expect(await getDispute(randomUUID(), dispute.id)).toBeNull();
  });
  it("compiles cited evidence and stores a readable PDF plus email text", async () => {
    const [{ dispute }] = await listDisputes(context.merchant.id);
    const [complaint] = await db.select().from(complaints).where(eq(complaints.id, dispute.complaintId!));
    await addInternalNote(context, complaint.id, "INTERNAL-DO-NOT-EXPORT");
    const result = await compileEvidence(context, dispute.id, async request => {
      expect(request.user).not.toContain("INTERNAL-DO-NOT-EXPORT");
      return { model: "test-model", tokensIn: 10, tokensOut: 10, costUsd: 0, latencyMs: 1, data: {
        recommendation: { decision: "challenge", reasoning: "The simulated courier record can be reviewed." }, summary: "Demo evidence", rebuttal_points: [{ statement: "Payment was recorded.", evidence_ids: ["E2"] }], rebuttal_text: "For this demonstration, the payment and courier records are attached for review. No real bank has been contacted.", product_description: "Demo item", weaknesses: [{ issue: "Simulated data", impact: "Not valid for a real submission" }],
      } };
    });
    expect(result.fields.email).toContain("DEMONSTRATION ONLY");
    expect(result.selectedEvidence).toContain(2);
    const file = await readEvidenceBytes(result.packetFileId!, context.merchant.id);
    expect(file?.file.mime).toBe("application/pdf");
    expect((await PDFDocument.load(file!.bytes)).getPageCount()).toBeGreaterThan(1);
    expect(await readEvidenceBytes(result.packetFileId!, randomUUID())).toBeNull();
    const edited = await saveEvidenceDraft(context, dispute.id, "The merchant reviewed and edited this simulated response. Attached are the source records.");
    expect(edited.version).toBe(result.version + 1);
    expect(edited.fields.email).toContain("reviewed and edited");
    expect(edited.packetFileId).not.toBe(result.packetFileId);
    expect((await verifyOrderLedger(dispute.orderId, context.merchant.id))?.ok).toBe(true);
    expect(await getComplaintThreadByToken("invalid")).toBeNull();
  });
  it("stores reviewed email provenance idempotently and rejects a different merchant", async () => {
    const [order] = await db.select().from(orders).where(eq(orders.merchantId, context.merchant.id));
    const input = { raw: "DEMO email: DHL says delivered. Not carrier-verified.", orderNumber: order.number, carrier: "DHL", tracking: "DEMO123456", reportedDate: "2026-10-09", status: "delivered" };
    await importDeliveryEmail(context, input);
    await importDeliveryEmail(context, input);
    const events = await db.select().from(ledgerEvents).where(eq(ledgerEvents.orderId, order.id));
    const imported = events.filter(e => e.type === "delivery.email_imported");
    expect(imported).toHaveLength(1);
    expect(imported[0].payload.raw).toBe(input.raw);
    expect(imported[0].summary).toContain("not carrier-verified");
    expect((await verifyOrderLedger(order.id, context.merchant.id))?.ok).toBe(true);
    await expect(importDeliveryEmail({ ...context, merchant: { ...context.merchant, id: randomUUID() } }, input)).rejects.toThrow("not in your workspace");
  });
  it("gates win assessment and validates source citations before storing it", async () => {
    const [{ dispute }] = await listDisputes(context.merchant.id);
    await expect(assessDispute(context, dispute.id)).rejects.toThrow("Premium");
    const premium = { ...context, merchant: { ...context.merchant, settings: { ...context.merchant.settings, billing: { subscriptionId: "sub_test", status: "active" } } } };
    const output = { likelihood_percent: 60, confidence: "low", explanation: "Subjective estimate using simulated delivery records.", supporting_points: [{ statement: "Payment exists.", evidence_ids: ["E2"] }], weaknesses: ["No independently verified recipient."], next_steps: ["Request recipient proof."] };
    const complete = async () => ({ data: output, model: "test", tokensIn: 1, tokensOut: 1, costUsd: 0, latencyMs: 1 });
    await assessDispute(premium, dispute.id, complete);
    expect((await latestAssessment(context.merchant.id, dispute.id))?.assessment.likelihood_percent).toBe(60);
    expect(await latestAssessment(randomUUID(), dispute.id)).toBeNull();
    output.supporting_points[0].evidence_ids = ["E99999"];
    await expect(assessDispute(premium, dispute.id, complete)).rejects.toThrow("unknown source");
  });

  it("allows demo-shop Stripe test orders into evidence review but rejects live payments", async () => {
    const existing = await listDisputes(context.merchant.id);
    const rows = await db.select().from(orders).where(eq(orders.merchantId, context.merchant.id));
    const order = rows.find(row => !existing.some(item => item.dispute.orderId === row.id))!;
    await db.update(orders).set({ source: "demo_store", simulated: false, paidAt: new Date() }).where(eq(orders.id, order.id));
    await db.update(payments).set({ provider: "stripe", status: "succeeded", livemode: false }).where(eq(payments.orderId, order.id));
    expect((await simulateDispute(context, order.id)).orderId).toBe(order.id);
    await db.update(payments).set({ livemode: true }).where(eq(payments.orderId, order.id));
    await expect(simulateDispute(context, order.id)).rejects.toThrow("Stripe test orders");
  });

  it("imports Stripe dispute updates idempotently and records closure", async () => {
    const [payment] = await db.select().from(payments).where(eq(payments.merchantId, context.merchant.id));
    const chargeId = `ch_test_${randomUUID()}`;
    await db.update(payments).set({ chargeId, livemode: false }).where(eq(payments.id, payment.id));
    const source = { id: `dp_test_${randomUUID()}`, charge: chargeId, payment_intent: null, amount: payment.amountMinor, currency: "eur", reason: "product_not_received", status: "needs_response", livemode: false, created: Math.floor(Date.now()/1000), evidence_details: { due_by: Math.floor(Date.now()/1000)+86400 } } as unknown as Stripe.Response<Stripe.Dispute>;
    const eventId = `evt_${randomUUID()}`;
    expect(await syncDispute(source.id, eventId, async () => source)).toBe(true);
    expect(await syncDispute(source.id, eventId, async () => source)).toBe(true);
    const events = await db.select().from(ledgerEvents).where(eq(ledgerEvents.orderId, payment.orderId));
    expect(events.filter(event => event.sourceRef === source.id)).toHaveLength(1);
    source.status = "won";
    await syncDispute(source.id, `evt_${randomUUID()}`, async () => source);
    const record = (await listDisputes(context.merchant.id)).find(row => row.dispute.stripeDisputeId === source.id);
    expect(record?.dispute.outcome).toBe("won");
    expect((await verifyOrderLedger(payment.orderId, context.merchant.id))?.ok).toBe(true);
  });

});
