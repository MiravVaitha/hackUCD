import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { isDatabaseConfigured, missingEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Deployment health and setup status. Reports missing configuration by
 * variable name only; it never returns a value.
 */
export async function GET() {
  let database: "ok" | "unreachable" | "not_configured" = "not_configured";

  if (isDatabaseConfigured()) {
    try {
      await db.execute(sql`select 1`);
      database = "ok";
    } catch {
      database = "unreachable";
    }
  }

  const missing = missingEnv().map((item) => item.name);
  const ok = database === "ok";

  return Response.json(
    {
      ok,
      database,
      setup: { complete: missing.length === 0, missing },
      time: new Date().toISOString(),
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
