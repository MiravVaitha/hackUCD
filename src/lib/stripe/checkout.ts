import { eq } from "drizzle-orm";
import type Stripe from "stripe";

import { db } from "@/db/client";
import { orders, type Order, type OrderItem } from "@/db/schema";
import { getStripe, ORDER_ID_METADATA_KEY, ORDER_NUMBER_METADATA_KEY } from "./client";

/**
 * Fixed label that groups this integration's sessions in the Stripe Dashboard.
 * Ends in eight random letters, as Stripe recommends.
 */
const INTEGRATION_IDENTIFIER = "proofshield_demo_store_qmzkvtwb";

/** A fictional shopper, so a live demo only needs a card number typed in. */
export const DEMO_SHOPPER = {
  name: "Saoirse Doyle",
  email: "saoirse.doyle@example.com",
  address: {
    line1: "14 Harbour Road",
    city: "Galway",
    state: "Galway",
    postal_code: "H91 X2P7",
    country: "IE",
  },
} as const;

/** Find or create the Stripe customer record for the demo shopper. */
async function getDemoShopperCustomerId(): Promise<string> {
  const stripe = getStripe();
  const existing = await stripe.customers.list({ email: DEMO_SHOPPER.email, limit: 1 });
  const found = existing.data[0];
  if (found) {
    // Keep the saved address in step with the one defined here.
    if (found.shipping?.address?.state !== DEMO_SHOPPER.address.state) {
      await stripe.customers.update(found.id, {
        address: DEMO_SHOPPER.address,
        shipping: { name: DEMO_SHOPPER.name, address: DEMO_SHOPPER.address },
      });
    }
    return found.id;
  }

  const customer = await stripe.customers.create({
    name: DEMO_SHOPPER.name,
    email: DEMO_SHOPPER.email,
    address: DEMO_SHOPPER.address,
    shipping: { name: DEMO_SHOPPER.name, address: DEMO_SHOPPER.address },
    metadata: { ps_demo_shopper: "true" },
  });
  return customer.id;
}

export type CheckoutOptions = {
  order: Order;
  items: OrderItem[];
  /** Public origin of this deployment, used for the return URLs. */
  origin: string;
  /** Prefill the fictional demo shopper's name and address. */
  useDemoShopper: boolean;
};

/**
 * Create a Stripe-hosted Checkout Session for a pending order.
 *
 * Payment methods are left to Stripe's dynamic selection. The order ID travels
 * on both the session and the PaymentIntent so every later event, including a
 * dispute, can be matched back to the order.
 */
export async function createCheckoutSession(options: CheckoutOptions): Promise<Stripe.Checkout.Session> {
  const { order, items, origin, useDemoShopper } = options;
  const metadata = {
    [ORDER_ID_METADATA_KEY]: order.id,
    [ORDER_NUMBER_METADATA_KEY]: order.number,
  };

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    client_reference_id: order.id,
    line_items: items.map((item) => ({
      quantity: item.quantity,
      price_data: {
        currency: order.currency,
        unit_amount: item.unitPriceMinor,
        product_data: { name: item.name, metadata: { sku: item.sku } },
      },
    })),
    billing_address_collection: "required",
    shipping_address_collection: { allowed_countries: ["IE", "GB"] },
    shipping_options: [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          display_name: "Tracked delivery",
          fixed_amount: { amount: order.shippingMinor, currency: order.currency },
        },
      },
    ],
    metadata,
    payment_intent_data: {
      description: `Voltbox order ${order.number}`,
      metadata,
    },
    success_url: `${origin}/store/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/store?cancelled=1`,
    integration_identifier: INTEGRATION_IDENTIFIER,
  };

  if (useDemoShopper) {
    params.customer = await getDemoShopperCustomerId();
    params.customer_update = { address: "auto", name: "auto", shipping: "auto" };
  }

  const session = await getStripe().checkout.sessions.create(params);

  await db
    .update(orders)
    .set({ checkoutSessionId: session.id })
    .where(eq(orders.id, order.id));

  return session;
}
