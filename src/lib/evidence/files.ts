import { and, eq, inArray } from "drizzle-orm";

import { db, type DbOrTx } from "@/db/client";
import {
  evidenceFiles,
  type EvidenceFile,
  type EvidenceFileKind,
  type LedgerAttachment,
} from "@/db/schema";
import { sha256Hex } from "@/lib/ledger/canonical";
import { evidenceStore } from "./store";

export const MAX_EVIDENCE_FILE_BYTES = 4 * 1024 * 1024;

export type SaveEvidenceFileInput = {
  merchantId: string;
  orderId: string | null;
  kind: EvidenceFileKind;
  mime: string;
  bytes: Buffer;
  width?: number | null;
  height?: number | null;
  originalName?: string | null;
  capturedAt?: Date | null;
  simulated?: boolean;
  createdByUserId?: string | null;
};

/**
 * Store a file and its metadata. The SHA-256 is computed here, on the server,
 * from the exact bytes that are stored.
 */
export async function saveEvidenceFile(
  input: SaveEvidenceFileInput,
  executor: DbOrTx = db,
): Promise<EvidenceFile> {
  if (input.bytes.length === 0) throw new Error("Evidence file is empty");
  if (input.bytes.length > MAX_EVIDENCE_FILE_BYTES) {
    throw new Error("Evidence file is larger than the 4 MB limit");
  }

  return executor.transaction(async (tx) => {
    const [file] = await tx
      .insert(evidenceFiles)
      .values({
        merchantId: input.merchantId,
        orderId: input.orderId,
        kind: input.kind,
        mime: input.mime,
        sizeBytes: input.bytes.length,
        sha256: sha256Hex(input.bytes),
        width: input.width ?? null,
        height: input.height ?? null,
        originalName: input.originalName ?? null,
        capturedAt: input.capturedAt ?? null,
        simulated: input.simulated ?? false,
        storageDriver: evidenceStore.driver,
        createdByUserId: input.createdByUserId ?? null,
      })
      .returning();
    await evidenceStore.put(file.id, input.bytes, tx);
    return file;
  });
}

export function toAttachment(file: EvidenceFile): LedgerAttachment {
  return { fileId: file.id, sha256: file.sha256, kind: file.kind };
}

/** Metadata for a file, scoped to the merchant that owns it. */
export async function getEvidenceFile(
  fileId: string,
  merchantId: string,
  executor: DbOrTx = db,
): Promise<EvidenceFile | null> {
  const [file] = await executor
    .select()
    .from(evidenceFiles)
    .where(and(eq(evidenceFiles.id, fileId), eq(evidenceFiles.merchantId, merchantId)))
    .limit(1);
  return file ?? null;
}

export async function getEvidenceFiles(
  fileIds: string[],
  merchantId: string,
  executor: DbOrTx = db,
): Promise<EvidenceFile[]> {
  if (fileIds.length === 0) return [];
  return executor
    .select()
    .from(evidenceFiles)
    .where(and(inArray(evidenceFiles.id, fileIds), eq(evidenceFiles.merchantId, merchantId)));
}

export async function readEvidenceBytes(
  fileId: string,
  merchantId: string,
  executor: DbOrTx = db,
): Promise<{ file: EvidenceFile; bytes: Buffer } | null> {
  const file = await getEvidenceFile(fileId, merchantId, executor);
  if (!file) return null;
  const bytes = await evidenceStore.get(file.id, executor);
  if (!bytes) return null;
  return { file, bytes };
}
