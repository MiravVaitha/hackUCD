import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { ledgerEvents, orders } from "@/db/schema";
import { getEvidenceFiles } from "@/lib/evidence/files";
import { evidenceStore } from "@/lib/evidence/store";
import { sha256Hex } from "./canonical";
import { verifyChain, type ChainProblem } from "./chain";

export type LedgerVerification = {
  ok: boolean;
  orderId: string;
  eventCount: number;
  fileCount: number;
  headHash: string | null;
  checkedAt: string;
  problems: ChainProblem[];
};

/**
 * Recompute an order's hash chain and re-hash every attached file from the
 * stored bytes. Detects edits, removals and reordering made after recording.
 */
export async function verifyOrderLedger(
  orderId: string,
  merchantId: string,
): Promise<LedgerVerification | null> {
  const [order] = await db
    .select({ id: orders.id, head: orders.ledgerHeadHash })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.merchantId, merchantId)))
    .limit(1);
  if (!order) return null;

  const events = await db
    .select()
    .from(ledgerEvents)
    .where(eq(ledgerEvents.orderId, order.id))
    .orderBy(asc(ledgerEvents.seq));

  const problems = verifyChain(order.id, events, order.head);

  // Each attached file is re-hashed and compared with both its own record and
  // the hash that was written into the ledger event.
  const claimed = new Map<string, { sha256: string; seq: number }>();
  for (const event of events) {
    for (const attachment of event.attachments) {
      if (!claimed.has(attachment.fileId)) {
        claimed.set(attachment.fileId, { sha256: attachment.sha256, seq: event.seq });
      }
    }
  }

  const files = await getEvidenceFiles([...claimed.keys()], merchantId);
  const filesById = new Map(files.map((file) => [file.id, file]));

  for (const [fileId, claim] of claimed) {
    const file = filesById.get(fileId);
    const bytes = file ? await evidenceStore.get(fileId) : null;
    if (!file || !bytes) {
      problems.push({
        seq: claim.seq,
        kind: "file_missing",
        detail: "A file referenced by this event is no longer stored.",
      });
      continue;
    }
    const actual = sha256Hex(bytes);
    if (actual !== claim.sha256 || actual !== file.sha256) {
      problems.push({
        seq: claim.seq,
        kind: "file_hash_mismatch",
        detail: "A stored file no longer matches the hash recorded when it was captured.",
      });
    }
  }

  return {
    ok: problems.length === 0,
    orderId: order.id,
    eventCount: events.length,
    fileCount: claimed.size,
    headHash: order.head,
    checkedAt: new Date().toISOString(),
    problems,
  };
}
