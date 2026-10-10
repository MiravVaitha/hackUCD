import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { databaseUrl, MissingEnvError } from "@/lib/env";
import * as schema from "./schema";

type Sql = ReturnType<typeof postgres>;
export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

// One client per process. Kept on globalThis so dev hot reloads reuse it.
const globalForDb = globalThis as unknown as { __psSql?: Sql; __psDb?: Db };

function getDb(): Db {
  if (!globalForDb.__psDb) {
    const url = databaseUrl();
    if (!url) throw new MissingEnvError("DATABASE_URL");
    globalForDb.__psSql = postgres(url, {
      // Required for pooled (transaction-mode) connections such as Neon's.
      prepare: false,
      max: 5,
      idle_timeout: 20,
      connect_timeout: 15,
      onnotice: () => {},
    });
    globalForDb.__psDb = drizzle(globalForDb.__psSql, { schema });
  }
  return globalForDb.__psDb;
}

/** Lazily connected database handle. Connects on first use, not at import. */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

/** Close the pool. Used by scripts so the process can exit. */
export async function closeDb(): Promise<void> {
  if (globalForDb.__psSql) {
    await globalForDb.__psSql.end({ timeout: 5 });
    globalForDb.__psSql = undefined;
    globalForDb.__psDb = undefined;
  }
}

export { schema };
