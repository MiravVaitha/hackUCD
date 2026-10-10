import { asc, eq } from "drizzle-orm";
import { CircleCheck, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ClearCart } from "@/components/store/clear-cart";
import { ProductArt } from "@/components/store/product-art";
import { db } from "@/db/client";
import { orderItems, orders, shipments } from "@/db/schema";
import { describeStripeError } from "@/lib/stripe/client";
import { recordPaidCheckoutSession } from "@/lib/stripe/payments";
import { formatAddress, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Order confirmed" };
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-8 sm:py-16">{children}</div>;
}

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string | string[] }>;
}) {
  const params = await searchParams;
  const sessionId = typeof params.session_id === "string" ? params.session_id : "";

  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold text-ink-950">We could not find that order</h1>
        <p className="mt-2 text-ink-600">
          The link is missing its order reference.{" "}
          <Link href="/store" className="font-medium text-ink-950 underline underline-offset-2">
            Back to the shop
          </Link>
        </p>
      </Shell>
    );
  }

  // The webhook normally records the payment first. Doing it here as well means
  // the customer sees their order even if the webhook is slow. It is idempotent.
  let paid = false;
  try {
    const result = await recordPaidCheckoutSession(sessionId);
    paid = result.status === "recorded" || result.status === "already_recorded";
  } catch (error) {
    console.error("[store success] could not confirm payment:", describeStripeError(error));
  }

  const [order] = await db.select().from(orders).where(eq(orders.checkoutSessionId, sessionId)).limit(1);

  if (!order || !paid) {
    return (
      <Shell>
        <Clock className="h-10 w-10 text-amber-600" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-semibold text-ink-950">Your payment is still being confirmed</h1>
        <p className="mt-2 text-ink-600">
          This usually takes a few seconds. Refresh this page to check again
          {order ? `, quoting order ${order.number} if you contact us` : ""}.
        </p>
      </Shell>
    );
  }

  const [items, [shipment]] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.name)),
    db.select().from(shipments).where(eq(shipments.orderId, order.id)).limit(1),
  ]);
  const address = formatAddress(order.shippingAddress);
  const firstName = order.customerName?.split(" ")[0];

  return (
    <Shell>
      <ClearCart />
      <CircleCheck className="h-10 w-10 text-seal-600" aria-hidden="true" />
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink-950">
        Thanks{firstName ? `, ${firstName}` : ""}. Your order is confirmed.
      </h1>
      <p className="mt-2 text-ink-600">
        Order <span className="font-mono font-medium text-ink-950">{order.number}</span>
        {order.customerEmail ? (
          <>
            {" "}
            for <span className="text-ink-950">{order.customerEmail}</span>
          </>
        ) : null}
      </p>

      <div className="mt-8 rounded-2xl border border-ink-200 p-5">
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3">
              <ProductArt art={item.art} size="thumb" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-950">{item.name}</p>
                <p className="text-sm text-ink-500">Quantity {item.quantity}</p>
              </div>
              <span className="text-sm font-medium tabular-nums text-ink-950">
                {formatMoney(item.unitPriceMinor * item.quantity, order.currency)}
              </span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1.5 border-t border-ink-100 pt-4 text-sm">
          <div className="flex justify-between text-ink-600">
            <dt>Tracked delivery</dt>
            <dd className="tabular-nums">{formatMoney(order.shippingMinor, order.currency)}</dd>
          </div>
          <div className="flex justify-between text-base font-semibold text-ink-950">
            <dt>Total paid</dt>
            <dd className="tabular-nums">{formatMoney(order.totalMinor, order.currency)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        {address.length > 0 ? (
          <div>
            <h2 className="text-sm font-semibold text-ink-950">Delivering to</h2>
            <address className="mt-1 text-sm text-ink-600 not-italic">
              {address.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
          </div>
        ) : null}
        {shipment ? (
          <div>
            <h2 className="text-sm font-semibold text-ink-950">Tracking</h2>
            <p className="mt-1 text-sm text-ink-600">
              {shipment.carrier} {shipment.service}
              <span className="block font-mono text-ink-950">{shipment.trackingNumber}</span>
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/store"
          className="inline-flex h-11 items-center rounded-full bg-ink-950 px-5 text-sm font-medium text-white hover:bg-ink-800"
        >
          Keep shopping
        </Link>
        <Link
          href={`/store/help?order=${encodeURIComponent(order.number)}`}
          className="inline-flex h-11 items-center rounded-full border border-ink-200 px-5 text-sm font-medium text-ink-900 hover:bg-ink-50"
        >
          Problem with this order?
        </Link>
      </div>
    </Shell>
  );
}
