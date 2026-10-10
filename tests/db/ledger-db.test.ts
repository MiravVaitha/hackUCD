import { asc, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { closeDb, db } from "@/db/client";
import { evidenceBlobs, evidenceFiles, ledgerEvents, orders } from "@/db/schema";
import { saveEvidenceFile, toAttachment } from "@/lib/evidence/files";
import { appendLedgerEvent, SYSTEM_ACTOR } from "@/lib/ledger/append";
import { verifyOrderLedger } from "@/lib/ledger/verify";
import { cleanupTestOrders, createTestOrder } from "./helpers";

afterAll(async () => {
  await cleanupTestOrders();
  await closeDb();
});

/** Drizzle wraps driver errors, so look through the cause chain for the database message. */
function errorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  while (current && parts.length < 5) {
    parts.push(current instanceof Error ? current.message : String(current));
    current = current instanceof Error ? current.cause : undefined;
  }
  return parts.join(" | ");
}

async function expectRejected(run: () => Promise<unknown>, pattern: RegExp) {
  let caught: unknown;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  expect(caught, "expected the statement to be rejected").toBeTruthy();
  expect(errorText(caught)).toMatch(pattern);
}

describe("ledger in the database", () => {
  it("keeps concurrent appends in one unbroken chain", async () => {
    const order = await createTestOrder();

    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        appendLedgerEvent({
          merchantId: order.merchantId,
          orderId: order.id,
          type: "packing.item_verified",
          summary: `Concurrent event ${index}`,
          actor: SYSTEM_ACTOR,
          source: "test",
          payload: { index },
        }),
      ),
    );

    const events = await db
      .select()
      .from(ledgerEvents)
      .where(eq(ledgerEvents.orderId, order.id))
      .orderBy(asc(ledgerEvents.seq));
    expect(events.map((event) => event.seq)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));

    const report = await verifyOrderLedger(order.id, order.merchantId);
    expect(report?.ok).toBe(true);
    expect(report?.eventCount).toBe(12);
  });

  it("returns the first event when a dedupe key repeats", async () => {
    const order = await createTestOrder();
    const input = {
      merchantId: order.merchantId,
      orderId: order.id,
      type: "payment.succeeded" as const,
      summary: "Payment succeeded",
      actor: SYSTEM_ACTOR,
      source: "stripe",
      sourceRef: "pi_test_123",
      dedupeKey: "payment.succeeded:pi_test_123",
    };
    const first = await appendLedgerEvent(input);
    const second = await appendLedgerEvent(input);
    expect(second.id).toBe(first.id);

    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row.ledgerSeq).toBe(1);
  });

  it("refuses to record evidence against another merchant's order", async () => {
    const order = await createTestOrder();
    await expect(
      appendLedgerEvent({
        merchantId: "00000000-0000-0000-0000-000000000000",
        orderId: order.id,
        type: "order.placed",
        summary: "Should not be recorded",
        actor: SYSTEM_ACTOR,
        source: "test",
      }),
    ).rejects.toThrow(/another merchant/);
  });

  it("rejects UPDATE and DELETE on ledger rows", async () => {
    const order = await createTestOrder();
    const event = await appendLedgerEvent({
      merchantId: order.merchantId,
      orderId: order.id,
      type: "order.placed",
      summary: "Order placed",
      actor: SYSTEM_ACTOR,
      source: "test",
    });

    await expectRejected(
      () => db.update(ledgerEvents).set({ summary: "Edited" }).where(eq(ledgerEvents.id, event.id)),
      /append-only/,
    );
    await expectRejected(
      () => db.delete(ledgerEvents).where(eq(ledgerEvents.id, event.id)),
      /append-only/,
    );

    const [still] = await db.select().from(ledgerEvents).where(eq(ledgerEvents.id, event.id));
    expect(still.summary).toBe("Order placed");
  });

  it("rejects deleting an order that has evidence", async () => {
    const order = await createTestOrder();
    await appendLedgerEvent({
      merchantId: order.merchantId,
      orderId: order.id,
      type: "order.placed",
      summary: "Order placed",
      actor: SYSTEM_ACTOR,
      source: "test",
    });
    await expectRejected(() => db.delete(orders).where(eq(orders.id, order.id)), /append-only/);
  });

  it("stores files by content hash and detects nothing wrong when untouched", async () => {
    const order = await createTestOrder();
    const bytes = Buffer.from("pretend this is a JPEG of an open parcel");
    const file = await saveEvidenceFile({
      merchantId: order.merchantId,
      orderId: order.id,
      kind: "packing_contents_photo",
      mime: "image/jpeg",
      bytes,
    });
    expect(file.sha256).toHaveLength(64);
    expect(file.sizeBytes).toBe(bytes.length);

    await appendLedgerEvent({
      merchantId: order.merchantId,
      orderId: order.id,
      type: "packing.contents_photo",
      summary: "Photo of parcel contents",
      actor: SYSTEM_ACTOR,
      source: "test",
      attachments: [toAttachment(file)],
    });

    const report = await verifyOrderLedger(order.id, order.merchantId);
    expect(report).toMatchObject({ ok: true, eventCount: 1, fileCount: 1 });
  });

  it("rejects changing stored file bytes or metadata", async () => {
    const order = await createTestOrder();
    const file = await saveEvidenceFile({
      merchantId: order.merchantId,
      orderId: order.id,
      kind: "packing_label_photo",
      mime: "image/jpeg",
      bytes: Buffer.from("original bytes"),
    });

    await expectRejected(
      () =>
        db
          .update(evidenceBlobs)
          .set({ bytes: Buffer.from("swapped bytes") })
          .where(eq(evidenceBlobs.fileId, file.id)),
      /append-only/,
    );
    await expectRejected(
      () => db.update(evidenceFiles).set({ sha256: "0".repeat(64) }).where(eq(evidenceFiles.id, file.id)),
      /append-only/,
    );
  });

  it("does not verify another merchant's order", async () => {
    const order = await createTestOrder();
    expect(await verifyOrderLedger(order.id, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
