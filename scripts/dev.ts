import "./load-env";

import { spawn } from "node:child_process";

import { startLocalDatabase } from "./dev-db";

/**
 * `pnpm dev`: make sure a database is available, bring the schema and demo
 * merchant up to date, then run the Next.js dev server.
 */
async function main() {
  const hasExternalDatabase = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  const stopDatabase = hasExternalDatabase ? null : await startLocalDatabase();

  // Imported after the database is up so their connections succeed.
  const { runMigrations } = await import("./migrate");
  const { runBootstrap } = await import("./bootstrap");
  const { closeDb } = await import("../src/db/client");
  await runMigrations();
  await runBootstrap();
  await closeDb();

  const nextBin = require.resolve("next/dist/bin/next");
  const child = spawn(process.execPath, [nextBin, "dev", ...process.argv.slice(2)], {
    stdio: "inherit",
    env: process.env,
  });

  let shuttingDown = false;
  const shutdown = async (code: number) => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (!child.killed) child.kill();
    if (stopDatabase) await stopDatabase().catch(() => {});
    process.exit(code);
  };

  child.on("exit", (code) => void shutdown(code ?? 0));
  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));
}

main().catch((error) => {
  console.error("[dev] Failed to start:", error instanceof Error ? error.message : error);
  process.exit(1);
});
