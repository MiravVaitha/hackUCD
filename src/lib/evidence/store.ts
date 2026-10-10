import { eq } from "drizzle-orm";

import { db, type DbOrTx } from "@/db/client";
import { evidenceBlobs } from "@/db/schema";

/**
 * Where evidence bytes live. The demo keeps them in Postgres so a file and its
 * ledger entry commit in one transaction and there is no storage service to
 * provision. An S3-compatible EU bucket can implement the same interface.
 */
export interface EvidenceStore {
  readonly driver: string;
  put(fileId: string, bytes: Buffer, executor?: DbOrTx): Promise<void>;
  get(fileId: string, executor?: DbOrTx): Promise<Buffer | null>;
}

class PostgresEvidenceStore implements EvidenceStore {
  readonly driver = "postgres";

  async put(fileId: string, bytes: Buffer, executor: DbOrTx = db): Promise<void> {
    await executor.insert(evidenceBlobs).values({ fileId, bytes });
  }

  async get(fileId: string, executor: DbOrTx = db): Promise<Buffer | null> {
    const [row] = await executor
      .select({ bytes: evidenceBlobs.bytes })
      .from(evidenceBlobs)
      .where(eq(evidenceBlobs.fileId, fileId))
      .limit(1);
    if (!row) return null;
    return Buffer.isBuffer(row.bytes) ? row.bytes : Buffer.from(row.bytes);
  }
}

export const evidenceStore: EvidenceStore = new PostgresEvidenceStore();
