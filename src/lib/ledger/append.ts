import { and, eq } from "drizzle-orm";

import { db, type DbOrTx } from "@/db/client";
import {
  ledgerEvents,
  orders,
  type LedgerActorType,
  type LedgerAttachment,
  type LedgerEvent,
} from "@/db/schema";
import { toPlainJson } from "./canonical";
import { eventHash, genesisHash } from "./chain";
import type { LedgerEventType } from "./types";

export type LedgerActor = {
  type: LedgerActorType;
  id?: string | null;
  label?: string | null;
};

export const SYSTEM_ACTOR: LedgerActor = { type: "system", label: "ProofShield" };

export type LedgerEventInput = {
  merchantId: string;
  orderId: string;
  type: LedgerEventType;
  /** One plain sentence a person can read in the timeline. */
  summary: string;
  actor: LedgerActor;
  /** The system the fact came from, e.g. "stripe" or "packing_station". */
  source: string;
  /** That system's own identifier for the fact, when it has one. */
  sourceRef?: string | null;
  /** When it happened according to the source. Defaults to now. */
  occurredAt?: Date;
  payload?: Record<string, unknown>;
  attachments?: LedgerAttachment[];
  simulated?: boolean;
  /** When set, a second append with the same key returns the first event. */
  dedupeKey?: string;
};

/**
 * Append one event to an order's hash chain.
 *
 * The order row is locked for the duration, so concurrent appends to the same
 * order queue up and the chain never forks. Pass a transaction to make the
 * append atomic with other writes.
 */
export async function appendLedgerEvent(
  input: LedgerEventInput,
  executor: DbOrTx = db,
): Promise<LedgerEvent> {
  return executor.transaction(async (tx) => {
    const [order] = await tx
      .select({
        id: orders.id,
        merchantId: orders.merchantId,
        seq: orders.ledgerSeq,
        head: orders.ledgerHeadHash,
      })
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .for("update");

    if (!order) throw new Error("Cannot record evidence: order not found");
    if (order.merchantId !== input.merchantId) {
      throw new Error("Cannot record evidence: order belongs to another merchant");
    }

    if (input.dedupeKey) {
      const [existing] = await tx
        .select()
        .from(ledgerEvents)
        .where(
          and(eq(ledgerEvents.orderId, order.id), eq(ledgerEvents.dedupeKey, input.dedupeKey)),
        )
        .limit(1);
      if (existing) return existing;
    }

    const recordedAt = new Date();
    const occurredAt = input.occurredAt ?? recordedAt;
    const seq = order.seq + 1;
    const prevHash = order.head ?? genesisHash(order.id);
    const payload = toPlainJson(input.payload ?? {});
    const attachments = toPlainJson(input.attachments ?? []);
    const simulated = input.simulated ?? false;

    const hash = eventHash(prevHash, {
      orderId: order.id,
      seq,
      type: input.type,
      occurredAt,
      recordedAt,
      actorType: input.actor.type,
      actorId: input.actor.id ?? null,
      actorLabel: input.actor.label ?? null,
      source: input.source,
      sourceRef: input.sourceRef ?? null,
      summary: input.summary,
      payload,
      attachments,
      simulated,
    });

    const [event] = await tx
      .insert(ledgerEvents)
      .values({
        merchantId: input.merchantId,
        orderId: order.id,
        seq,
        type: input.type,
        occurredAt,
        recordedAt,
        actorType: input.actor.type,
        actorId: input.actor.id ?? null,
        actorLabel: input.actor.label ?? null,
        source: input.source,
        sourceRef: input.sourceRef ?? null,
        summary: input.summary,
        payload,
        attachments,
        simulated,
        dedupeKey: input.dedupeKey ?? null,
        prevHash,
        hash,
      })
      .returning();

    await tx
      .update(orders)
      .set({ ledgerSeq: seq, ledgerHeadHash: hash })
      .where(eq(orders.id, order.id));

    return event;
  });
}
