import type { LedgerActorType, LedgerAttachment } from "@/db/schema";
import { canonicalize, sha256Hex } from "./canonical";

/** Bump when the hashed fields change, so old rows stay verifiable. */
export const LEDGER_HASH_VERSION = 1;

/** The fields of a ledger event that are covered by its hash. */
export type HashedEvent = {
  orderId: string;
  seq: number;
  type: string;
  occurredAt: Date;
  recordedAt: Date;
  actorType: LedgerActorType;
  actorId: string | null;
  actorLabel: string | null;
  source: string;
  sourceRef: string | null;
  summary: string;
  payload: Record<string, unknown>;
  attachments: LedgerAttachment[];
  simulated: boolean;
};

/** The link before an order's first event. Unique per order. */
export function genesisHash(orderId: string): string {
  return sha256Hex(`proofshield:ledger:v${LEDGER_HASH_VERSION}:genesis:${orderId}`);
}

export function eventHash(prevHash: string, event: HashedEvent): string {
  const body = canonicalize({
    v: LEDGER_HASH_VERSION,
    orderId: event.orderId,
    seq: event.seq,
    type: event.type,
    occurredAt: event.occurredAt.toISOString(),
    recordedAt: event.recordedAt.toISOString(),
    actor: {
      type: event.actorType,
      id: event.actorId,
      label: event.actorLabel,
    },
    source: event.source,
    sourceRef: event.sourceRef,
    summary: event.summary,
    payload: event.payload,
    attachments: event.attachments.map((attachment) => ({
      fileId: attachment.fileId,
      sha256: attachment.sha256,
      kind: attachment.kind,
    })),
    simulated: event.simulated,
  });
  return sha256Hex(prevHash + "\n" + body);
}

export type ChainProblem = {
  seq: number | null;
  kind:
    | "sequence_gap"
    | "broken_link"
    | "hash_mismatch"
    | "head_mismatch"
    | "file_missing"
    | "file_hash_mismatch";
  detail: string;
};

export type ChainEvent = HashedEvent & { prevHash: string; hash: string };

/**
 * Recompute an order's chain from its rows. Pure: no database access, so the
 * same function is used by the app and by the tests.
 */
export function verifyChain(
  orderId: string,
  events: ChainEvent[],
  recordedHead: string | null,
): ChainProblem[] {
  const problems: ChainProblem[] = [];
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  let expectedPrev = genesisHash(orderId);

  ordered.forEach((event, index) => {
    const expectedSeq = index + 1;
    if (event.seq !== expectedSeq) {
      problems.push({
        seq: event.seq,
        kind: "sequence_gap",
        detail: `Expected event ${expectedSeq} but found ${event.seq}. An event may have been removed.`,
      });
    }
    if (event.prevHash !== expectedPrev) {
      problems.push({
        seq: event.seq,
        kind: "broken_link",
        detail: "This event does not link to the one before it.",
      });
    }
    const recomputed = eventHash(event.prevHash, event);
    if (recomputed !== event.hash) {
      problems.push({
        seq: event.seq,
        kind: "hash_mismatch",
        detail: "The stored content no longer matches its recorded hash.",
      });
    }
    expectedPrev = event.hash;
  });

  const head = ordered.length ? ordered[ordered.length - 1].hash : null;
  if ((recordedHead ?? null) !== head) {
    problems.push({
      seq: null,
      kind: "head_mismatch",
      detail: "The order's recorded chain head does not match its last event.",
    });
  }

  return problems;
}
