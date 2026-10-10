import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";

import { db } from "@/db/client";
import {
  customers,
  orderItems,
  orders,
  payments,
  shipments,
  type Address,
} from "@/db/schema";
import { DEMO_CARRIER } from "@/lib/catalog";
import { appendLedgerEvent, SYSTEM_ACTOR } from "@/lib/ledger/append";
import { orderSequence, unitCount } from "@/lib/orders/service";
import { makeTrackingNumber } from "@/lib/packing/barcodes";
import { formatMoney } from "@/lib/utils";
import { getStripe, ORDER_ID_METADATA_KEY } from "./client";

export type RecordPaymentResult =
  | { status: "recorded"; orderId: string; orderNumber: string }
  | { status: "already_recorded"; orderId: string; orderNumber: string }
  | { status: "unknown_order" }
  | { status: "not_paid" };

/** Details Checkout collects that a bare PaymentIntent does not carry. */
export type PaymentContext = {
  customerEmail?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  stripeCustomerId?: string | null;
  shippingAddress?: Address | null;
  billingAddress?: Address | null;
  placedAt?: Date | null;
};

export function toAddress(
  address: Stripe.Address | null | undefined,
  name?: string | null,
  phone?: string | null,
): Address | null {
  if (!address && !name) return null;
  return {
    name: name ?? null,
    line1: address?.line1 ?? null,
    line2: address?.line2 ?? null,
    city: address?.city ?? null,
    state: address?.state ?? null,
    postalCode: address?.postal_code ?? null,
    country: address?.country ?? null,
    phone: phone ?? null,
  };
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/** "passed", "failed", "not checked" and so on, in words a person would use. */
export function describeCheck(value: string | null | undefined): string {
  switch (value) {
    case "pass":
      return "passed";
    case "fail":
      return "failed";
    case "unavailable":
      return "unavailable from the card issuer";
    case "unchecked":
      return "not checked";
    default:
      return "not provided";
  }
}

export function describeThreeDSecure(result: string | null | undefined): string {
  switch (result) {
    case "authenticated":
      return "authenticated";
    case "attempt_acknowledged":
      return "attempted and acknowledged by the issuer";
    case "exempted":
      return "exempted";
    case "failed":
      return "failed";
    case "not_supported":
      return "not supported by the card";
    case "processing_error":
      return "could not be completed";
    default:
      return "not used";
  }
}

/**
 * Record a succeeded payment against its order: payment evidence, the first
 * ledger events and the shipping label. Idempotent; safe to call from the
 * webhook, the reconcile and the checkout return page at the same time.
 */
export async function recordPaidPaymentIntent(
  paymentIntentId: string,
  context: PaymentContext = {},
): Promise<RecordPaymentResult> {
  const paymentIntent = await getStripe().paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge"],
  });

  const orderId = paymentIntent.metadata?.[ORDER_ID_METADATA_KEY];
  if (!orderId) return { status: "unknown_order" };
  if (paymentIntent.status !== "succeeded") return { status: "not_paid" };

  const charge =
    paymentIntent.latest_charge && typeof paymentIntent.latest_charge !== "string"
      ? paymentIntent.latest_charge
      : null;
  if (!charge) return { status: "not_paid" };

  const card = charge.payment_method_details?.card ?? null;
  const outcome = charge.outcome ?? null;
  const billing = charge.billing_details;
  const paidAt = new Date(charge.created * 1000);

  return db.transaction(async (tx) => {
    // Lock the order so concurrent callers record the payment exactly once.
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) return { status: "unknown_order" } as const;

    const [existing] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.paymentIntentId, paymentIntent.id))
      .limit(1);
    if (existing) {
      return { status: "already_recorded", orderId: order.id, orderNumber: order.number } as const;
    }

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));

    const customerEmail =
      (context.customerEmail ?? billing?.email ?? paymentIntent.receipt_email ?? order.customerEmail)?.toLowerCase() ??
      null;
    const customerName =
      context.customerName ?? billing?.name ?? paymentIntent.shipping?.name ?? order.customerName ?? null;
    const shippingAddress =
      context.shippingAddress ??
      toAddress(paymentIntent.shipping?.address, paymentIntent.shipping?.name, paymentIntent.shipping?.phone) ??
      order.shippingAddress ??
      null;
    const billingAddress =
      context.billingAddress ?? toAddress(billing?.address, billing?.name, billing?.phone) ?? order.billingAddress ?? null;
    const placedAt = context.placedAt ?? order.placedAt;

    let customerId = order.customerId;
    if (customerEmail) {
      const [customer] = await tx
        .insert(customers)
        .values({
          merchantId: order.merchantId,
          email: customerEmail,
          name: customerName,
          phone: context.customerPhone ?? billing?.phone ?? null,
          stripeCustomerId: context.stripeCustomerId ?? idOf(paymentIntent.customer),
        })
        .onConflictDoUpdate({
          target: [customers.merchantId, customers.email],
          set: { name: customerName },
        })
        .returning({ id: customers.id });
      customerId = customer.id;
    }

    await tx
      .update(orders)
      .set({
        customerId,
        customerEmail,
        customerName,
        shippingAddress,
        billingAddress,
        totalMinor: paymentIntent.amount_received || paymentIntent.amount,
        paymentStatus: "paid",
        placedAt,
        paidAt,
      })
      .where(eq(orders.id, order.id));

    const amountMinor = paymentIntent.amount_received || paymentIntent.amount;
    const threeDSecure = card?.three_d_secure
      ? {
          result: card.three_d_secure.result ?? null,
          version: card.three_d_secure.version ?? null,
          authenticationFlow: card.three_d_secure.authentication_flow ?? null,
          electronicCommerceIndicator: card.three_d_secure.electronic_commerce_indicator ?? null,
        }
      : null;

    await tx.insert(payments).values({
      merchantId: order.merchantId,
      orderId: order.id,
      provider: "stripe",
      paymentIntentId: paymentIntent.id,
      chargeId: charge.id,
      amountMinor,
      amountRefundedMinor: charge.amount_refunded ?? 0,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
      paymentMethodType: charge.payment_method_details?.type ?? null,
      cardBrand: card?.brand ?? null,
      cardLast4: card?.last4 ?? null,
      cardCountry: card?.country ?? null,
      cardFunding: card?.funding ?? null,
      wallet: card?.wallet?.type ?? null,
      cvcCheck: card?.checks?.cvc_check ?? null,
      addressLine1Check: card?.checks?.address_line1_check ?? null,
      postalCodeCheck: card?.checks?.address_postal_code_check ?? null,
      threeDSecure,
      riskLevel: outcome?.risk_level ?? null,
      riskScore: typeof outcome?.risk_score === "number" ? outcome.risk_score : null,
      networkStatus: outcome?.network_status ?? null,
      sellerMessage: outcome?.seller_message ?? null,
      receiptUrl: charge.receipt_url ?? null,
      livemode: paymentIntent.livemode,
      paidAt,
    });

    const units = unitCount(items);
    await appendLedgerEvent(
      {
        merchantId: order.merchantId,
        orderId: order.id,
        type: "order.placed",
        occurredAt: placedAt,
        actor: { type: "customer", label: customerName ?? "Customer" },
        source: order.source,
        sourceRef: order.number,
        summary:
          `Order ${order.number} placed for ${formatMoney(amountMinor, paymentIntent.currency)} ` +
          `(${units} item${units === 1 ? "" : "s"}).`,
        payload: {
          orderNumber: order.number,
          currency: paymentIntent.currency,
          subtotalMinor: order.subtotalMinor,
          shippingMinor: order.shippingMinor,
          totalMinor: amountMinor,
          items: items.map((item) => ({
            sku: item.sku,
            barcode: item.barcode,
            name: item.name,
            quantity: item.quantity,
            unitPriceMinor: item.unitPriceMinor,
          })),
          customer: { name: customerName, email: customerEmail },
          shippingAddress,
          billingAddress,
        },
        dedupeKey: "order.placed",
      },
      tx,
    );

    const cardText = card
      ? `${(card.brand ?? "card").toUpperCase()} ending ${card.last4 ?? "····"}`
      : (charge.payment_method_details?.type ?? "payment method");
    await appendLedgerEvent(
      {
        merchantId: order.merchantId,
        orderId: order.id,
        type: "payment.succeeded",
        occurredAt: paidAt,
        actor: { type: "integration", label: "Stripe" },
        source: "stripe",
        sourceRef: paymentIntent.id,
        summary:
          `Payment of ${formatMoney(amountMinor, paymentIntent.currency)} succeeded on ${cardText}. ` +
          `CVC check ${describeCheck(card?.checks?.cvc_check)}; ` +
          `postcode check ${describeCheck(card?.checks?.address_postal_code_check)}; ` +
          `3D Secure ${describeThreeDSecure(card?.three_d_secure?.result)}.`,
        payload: {
          provider: "stripe",
          paymentIntentId: paymentIntent.id,
          chargeId: charge.id,
          amountMinor,
          currency: paymentIntent.currency,
          livemode: paymentIntent.livemode,
          card: card
            ? {
                brand: card.brand ?? null,
                last4: card.last4 ?? null,
                country: card.country ?? null,
                funding: card.funding ?? null,
                wallet: card.wallet?.type ?? null,
              }
            : null,
          checks: {
            cvc: card?.checks?.cvc_check ?? null,
            addressLine1: card?.checks?.address_line1_check ?? null,
            postalCode: card?.checks?.address_postal_code_check ?? null,
          },
          threeDSecure,
          risk: {
            level: outcome?.risk_level ?? null,
            score: typeof outcome?.risk_score === "number" ? outcome.risk_score : null,
          },
          networkStatus: outcome?.network_status ?? null,
          sellerMessage: outcome?.seller_message ?? null,
          billingName: billing?.name ?? null,
          billingPostalCode: billing?.address?.postal_code ?? null,
        },
        dedupeKey: `payment.succeeded:${paymentIntent.id}`,
      },
      tx,
    );

    // The demo courier issues a label as soon as the order is paid.
    const [existingShipment] = await tx
      .select({ id: shipments.id })
      .from(shipments)
      .where(and(eq(shipments.orderId, order.id)))
      .limit(1);
    if (!existingShipment) {
      const trackingNumber = makeTrackingNumber(orderSequence(order.number));
      await tx.insert(shipments).values({
        merchantId: order.merchantId,
        orderId: order.id,
        carrier: DEMO_CARRIER.name,
        service: DEMO_CARRIER.service,
        trackingNumber,
        status: "label_created",
        simulated: true,
      });
      await appendLedgerEvent(
        {
          merchantId: order.merchantId,
          orderId: order.id,
          type: "shipment.label_created",
          actor: SYSTEM_ACTOR,
          source: "carrier:demo",
          sourceRef: trackingNumber,
          summary: `${DEMO_CARRIER.name} ${DEMO_CARRIER.service} label created with tracking number ${trackingNumber}.`,
          payload: {
            carrier: DEMO_CARRIER.name,
            service: DEMO_CARRIER.service,
            trackingNumber,
            shipTo: shippingAddress,
          },
          simulated: true,
          dedupeKey: "shipment.label_created",
        },
        tx,
      );
    }

    return { status: "recorded", orderId: order.id, orderNumber: order.number } as const;
  });
}

/**
 * Record the payment behind a completed Checkout Session, carrying over the
 * customer and address details Checkout collected.
 */
export async function recordPaidCheckoutSession(sessionId: string): Promise<RecordPaymentResult> {
  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  if (session.payment_status === "unpaid") return { status: "not_paid" };

  const paymentIntentId = idOf(session.payment_intent);
  if (!paymentIntentId) return { status: "not_paid" };

  const details = session.customer_details;
  const shipping = session.collected_information?.shipping_details ?? null;

  return recordPaidPaymentIntent(paymentIntentId, {
    customerEmail: details?.email ?? session.customer_email ?? null,
    customerName: details?.name ?? shipping?.name ?? null,
    customerPhone: details?.phone ?? null,
    stripeCustomerId: idOf(session.customer),
    shippingAddress: shipping ? toAddress(shipping.address, shipping.name, details?.phone) : null,
    billingAddress: toAddress(details?.address, details?.name, details?.phone),
    placedAt: new Date(session.created * 1000),
  });
}

/** Mark an order whose checkout was abandoned or whose payment failed. */
export async function markCheckoutFailed(sessionId: string): Promise<boolean> {
  const updated = await db
    .update(orders)
    .set({ paymentStatus: "failed" })
    .where(and(eq(orders.checkoutSessionId, sessionId), eq(orders.paymentStatus, "pending")))
    .returning({ id: orders.id });
  return updated.length > 0;
}
