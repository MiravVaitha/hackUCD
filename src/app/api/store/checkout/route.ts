import { isDatabaseConfigured, isStripeConfigured } from "@/lib/env";
import { createPendingOrder, OrderInputError, type CartLine } from "@/lib/orders/service";
import { createCheckoutSession } from "@/lib/stripe/checkout";
import { describeStripeError } from "@/lib/stripe/client";
import { getStoreMerchant, requestOrigin } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Turn a basket into a pending order and a Stripe Checkout Session. */
export async function POST(request: Request) {
  if (!isDatabaseConfigured() || !isStripeConfigured()) {
    return Response.json(
      { error: "Checkout is not available yet because this deployment is still being set up." },
      { status: 503 },
    );
  }

  let body: { items?: CartLine[]; useDemoShopper?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request could not be read." }, { status: 400 });
  }

  const merchant = await getStoreMerchant();
  if (!merchant) {
    return Response.json({ error: "The store is not set up yet." }, { status: 503 });
  }

  try {
    const { order, items } = await createPendingOrder(merchant, body.items ?? [], "demo_store");
    const session = await createCheckoutSession({
      order,
      items,
      origin: requestOrigin(request),
      useDemoShopper: body.useDemoShopper !== false,
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return Response.json({ url: session.url, orderNumber: order.number });
  } catch (error) {
    if (error instanceof OrderInputError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("[store checkout] failed:", describeStripeError(error));
    return Response.json(
      { error: "Checkout could not be started. Please try again." },
      { status: 502 },
    );
  }
}
