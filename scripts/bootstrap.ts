import "./load-env";

import { closeDb, db } from "../src/db/client";
import { bootstrapDemoMerchant } from "../src/lib/bootstrap";
import { env, isDatabaseConfigured } from "../src/lib/env";

/** Create or refresh the demo merchant, catalogue and logins. */
export async function runBootstrap(): Promise<void> {
  if (!isDatabaseConfigured()) {
    console.warn("[bootstrap] DATABASE_URL is not set. Skipping.");
    return;
  }

  const result = await bootstrapDemoMerchant(db, env.demoPassword);
  console.log(`[bootstrap] Merchant ready with ${result.products} products.`);
  if (result.usersSkipped) {
    console.warn("[bootstrap] DEMO_PASSWORD is not set. Demo logins were not created.");
  } else {
    console.log(
      `[bootstrap] Demo logins: ${result.usersCreated} created, ` +
        `${result.usersUpdated} updated, ${result.usersUnchanged} unchanged.`,
    );
  }
}

if (require.main === module) {
  runBootstrap()
    .then(() => closeDb())
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("[bootstrap] Failed:", error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
