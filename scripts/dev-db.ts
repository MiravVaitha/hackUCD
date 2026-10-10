import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

/**
 * Zero-setup local Postgres for development: a real Postgres server whose
 * binaries come from npm and whose data lives in ./.data/pg (git-ignored).
 * The credentials below are local-only defaults, not secrets.
 */
export const LOCAL_DB = {
  port: 54329,
  user: "postgres",
  password: "postgres",
  database: "proofshield",
  dataDir: path.join(process.cwd(), ".data", "pg"),
};

export function isPortOpen(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.setTimeout(1500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    const fail = () => {
      socket.destroy();
      resolve(false);
    };
    socket.once("error", fail);
    socket.once("timeout", fail);
  });
}

/**
 * Start the local database unless one is already listening.
 * Returns a stop function, or null when an existing server was reused.
 */
export async function startLocalDatabase(): Promise<(() => Promise<void>) | null> {
  if (await isPortOpen(LOCAL_DB.port)) {
    console.log(`[dev-db] Reusing Postgres already listening on port ${LOCAL_DB.port}.`);
    return null;
  }

  const server = new EmbeddedPostgres({
    databaseDir: LOCAL_DB.dataDir,
    port: LOCAL_DB.port,
    user: LOCAL_DB.user,
    password: LOCAL_DB.password,
    persistent: true,
    onLog: () => {},
    onError: (message) => {
      const text = String(message ?? "").trim();
      if (text) console.error("[dev-db]", text);
    },
  });

  const freshCluster = !fs.existsSync(path.join(LOCAL_DB.dataDir, "PG_VERSION"));
  if (freshCluster) {
    fs.mkdirSync(path.dirname(LOCAL_DB.dataDir), { recursive: true });
    console.log("[dev-db] Creating a new local database cluster...");
    await server.initialise();
  }

  await server.start();

  if (freshCluster) {
    await server.createDatabase(LOCAL_DB.database);
  } else {
    // An interrupted first run can leave the cluster without the database.
    try {
      await server.createDatabase(LOCAL_DB.database);
    } catch {
      // Already exists.
    }
  }

  console.log(`[dev-db] Postgres ready on port ${LOCAL_DB.port}.`);
  return () => server.stop();
}

if (require.main === module) {
  startLocalDatabase()
    .then((stop) => {
      if (!stop) process.exit(0);
      console.log("[dev-db] Running. Press Ctrl+C to stop.");
      const shutdown = () => {
        stop().finally(() => process.exit(0));
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    })
    .catch((error) => {
      console.error("[dev-db] Failed:", error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
