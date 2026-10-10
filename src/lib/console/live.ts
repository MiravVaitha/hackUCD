import { sql } from "drizzle-orm";

import { db } from "@/db/client";

/**
 * A cheap fingerprint of everything a merchant can see. The console polls it
 * and refreshes the page when it changes, so new orders, complaints and
 * dispute updates appear without a manual reload.
 */
export async function getLiveVersion(merchantId: string): Promise<string> {
  const rows = await db.execute<{ version: string }>(sql`
    select concat_ws(':',
      (select coalesce(settings->'billing'->>'status', 'free') from merchants where id = ${merchantId}),
      (select count(*) from ledger_events where merchant_id = ${merchantId}),
      (select count(*) from orders where merchant_id = ${merchantId} and payment_status <> 'pending'),
      (select count(*) from complaints where merchant_id = ${merchantId}),
      (select count(*) from complaint_messages m
         join complaints c on c.id = m.complaint_id where c.merchant_id = ${merchantId}),
      (select count(*) from ai_runs where merchant_id = ${merchantId} and status <> 'running'),
      (select count(*) from disputes where merchant_id = ${merchantId} and held = false),
      (select coalesce(sum(r.version), 0) from dispute_responses r
         join disputes d on d.id = r.dispute_id where d.merchant_id = ${merchantId}),
      (select count(*) from packing_scans s
         join packing_sessions p on p.id = s.session_id where p.merchant_id = ${merchantId})
    ) as version
  `);
  return rows[0]?.version ?? "0";
}
