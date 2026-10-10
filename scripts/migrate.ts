import "./load-env";

import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

import { migrationDatabaseUrl } from "../src/lib/env";

/** Apply pending SQL migrations from ./drizzle. Returns false when no database is configured. */
export async function runMigrations(): Promise<boolean> {
  const url = migrationDatabaseUrl();
  if (!url) {
    console.warn("[migrate] DATABASE_URL is not set. Skipping migrations.");
    return false;
  }

  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });
    console.log("[migrate] Database schema is up to date.");
    return true;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("[migrate] Failed:", error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
