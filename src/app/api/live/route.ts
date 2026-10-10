import { getSession } from "@/lib/auth/session";
import { getLiveVersion } from "@/lib/console/live";
import { syncStripeEvents } from "@/lib/stripe/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Polled by the merchant app. Reconciles with Stripe (throttled) and returns a
 * fingerprint of the merchant's data so the page knows when to refresh.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not signed in" }, { status: 401 });

  const sync = await syncStripeEvents().catch(() => null);
  const version = await getLiveVersion(session.merchant.id);

  return Response.json(
    { version, stripeSync: sync?.ran ? { processed: sync.processed, failed: sync.failed } : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
