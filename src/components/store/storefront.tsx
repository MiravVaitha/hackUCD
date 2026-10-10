"use client";

import { Check, Copy, Minus, Plus, ShoppingBag } from "lucide-react";
import { useState } from "react";

import { cn, formatMoney } from "@/lib/utils";
import { CART_MAX_QUANTITY, setQuantity, useCart } from "./cart-store";
import { ProductArt } from "./product-art";

export type StoreProduct = {
  sku: string;
  name: string;
  description: string;
  priceMinor: number;
  art: string;
};

const TEST_CARDS = [
  { number: "4242 4242 4242 4242", label: "Pays normally" },
  { number: "4000 0000 0000 2685", label: "Pays, then is disputed as not received" },
  { number: "4000 0000 0000 0259", label: "Pays, then is disputed as fraud" },
];

function QuantityStepper({ sku, quantity, name }: { sku: string; quantity: number; name: string }) {
  return (
    <div className="inline-flex h-10 items-center rounded-full border border-ink-200 bg-white">
      <button
        type="button"
        onClick={() => setQuantity(sku, quantity - 1)}
        className="flex h-10 w-10 items-center justify-center rounded-full text-ink-700 hover:bg-ink-100"
        aria-label={`Remove one ${name}`}
      >
        <Minus className="h-4 w-4" aria-hidden="true" />
      </button>
      <span className="w-6 text-center text-sm font-semibold tabular-nums" aria-live="polite">
        {quantity}
      </span>
      <button
        type="button"
        onClick={() => setQuantity(sku, quantity + 1)}
        disabled={quantity >= CART_MAX_QUANTITY}
        className="flex h-10 w-10 items-center justify-center rounded-full text-ink-700 hover:bg-ink-100 disabled:opacity-40"
        aria-label={`Add one more ${name}`}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function TestCards() {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (number: string) => {
    try {
      await navigator.clipboard.writeText(number.replace(/\s/g, ""));
      setCopied(number);
      setTimeout(() => setCopied((current) => (current === number ? null : current)), 1600);
    } catch {
      // Clipboard access can be blocked; the number is visible to type by hand.
    }
  };

  return (
    <div className="rounded-2xl border border-dashed border-ink-300 p-4">
      <p className="text-sm font-semibold text-ink-950">Test cards</p>
      <p className="mt-0.5 text-sm text-ink-500">Any future expiry date and any three-digit CVC.</p>
      <ul className="mt-3 space-y-2">
        {TEST_CARDS.map((card) => (
          <li key={card.number}>
            <button
              type="button"
              onClick={() => copy(card.number)}
              className="group flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-ink-50"
            >
              <span className="min-w-0">
                <span className="block font-mono text-[13px] text-ink-950">{card.number}</span>
                <span className="block text-xs text-ink-500">{card.label}</span>
              </span>
              {copied === card.number ? (
                <Check className="h-4 w-4 shrink-0 text-seal-600" aria-label="Copied" />
              ) : (
                <Copy className="h-4 w-4 shrink-0 text-ink-400 group-hover:text-ink-700" aria-label="Copy" />
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Storefront({
  products,
  currency,
  shippingMinor,
  checkoutReady,
  cancelled,
}: {
  products: StoreProduct[];
  currency: string;
  shippingMinor: number;
  checkoutReady: boolean;
  cancelled: boolean;
}) {
  const cart = useCart();
  const [useDemoShopper, setUseDemoShopper] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lines = products
    .filter((product) => (cart[product.sku] ?? 0) > 0)
    .map((product) => ({ product, quantity: cart[product.sku] }));
  const units = lines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = lines.reduce((sum, line) => sum + line.product.priceMinor * line.quantity, 0);
  const total = subtotal + (units > 0 ? shippingMinor : 0);

  const checkout = async () => {
    if (units === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/store/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines.map((line) => ({ sku: line.product.sku, quantity: line.quantity })),
          useDemoShopper,
        }),
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? "Checkout could not be started.");
      }
      window.location.assign(data.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Checkout could not be started.");
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-8 pb-32 sm:px-8 lg:pb-16">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl">
          Power and audio, shipped tomorrow.
        </h1>
        <p className="mt-2 text-ink-600">
          Chargers, cables and earbuds with tracked delivery across Ireland and the UK.
        </p>
      </div>

      {cancelled ? (
        <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
          Checkout was cancelled. Your basket is still here.
        </p>
      ) : null}

      <div className="mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => {
            const quantity = cart[product.sku] ?? 0;
            return (
              <li key={product.sku} data-sku={product.sku} className="flex flex-col">
                <ProductArt art={product.art} />
                <div className="mt-3 flex flex-1 flex-col">
                  <h2 className="font-medium text-ink-950">{product.name}</h2>
                  <p className="mt-1 flex-1 text-sm text-ink-500">{product.description}</p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-lg font-semibold tabular-nums text-ink-950">
                      {formatMoney(product.priceMinor, currency)}
                    </span>
                    {quantity > 0 ? (
                      <QuantityStepper sku={product.sku} quantity={quantity} name={product.name} />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setQuantity(product.sku, 1)}
                        className="h-10 rounded-full bg-ink-950 px-4 text-sm font-medium text-white transition-colors hover:bg-ink-800"
                        aria-label={`Add ${product.name} to basket`}
                      >
                        Add to basket
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <aside id="basket" className="mt-10 space-y-4 lg:sticky lg:top-6 lg:mt-0 lg:self-start">
          <div className="rounded-2xl border border-ink-200 bg-white p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-ink-950">
              <ShoppingBag className="h-5 w-5" aria-hidden="true" /> Basket
            </h2>

            {lines.length === 0 ? (
              <p className="mt-3 text-sm text-ink-500">Your basket is empty. Add something to get started.</p>
            ) : (
              <>
                <ul className="mt-4 space-y-3">
                  {lines.map(({ product, quantity }) => (
                    <li key={product.sku} className="flex items-center gap-3">
                      <ProductArt art={product.art} size="thumb" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink-950">{product.name}</p>
                        <p className="text-sm text-ink-500 tabular-nums">
                          {quantity} × {formatMoney(product.priceMinor, currency)}
                        </p>
                      </div>
                      <span className="text-sm font-medium tabular-nums text-ink-950">
                        {formatMoney(product.priceMinor * quantity, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
                <dl className="mt-4 space-y-1.5 border-t border-ink-100 pt-4 text-sm">
                  <div className="flex justify-between text-ink-600">
                    <dt>Subtotal</dt>
                    <dd className="tabular-nums">{formatMoney(subtotal, currency)}</dd>
                  </div>
                  <div className="flex justify-between text-ink-600">
                    <dt>Tracked delivery</dt>
                    <dd className="tabular-nums">{formatMoney(shippingMinor, currency)}</dd>
                  </div>
                  <div className="flex justify-between pt-1 text-base font-semibold text-ink-950">
                    <dt>Total</dt>
                    <dd className="tabular-nums">{formatMoney(total, currency)}</dd>
                  </div>
                </dl>
              </>
            )}

            <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={useDemoShopper}
                onChange={(event) => setUseDemoShopper(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-ink-300 accent-ink-950"
              />
              <span>
                Check out as the demo shopper
                <span className="block text-ink-500">
                  Fills in a fictional name and address, so only a card number is needed.
                </span>
              </span>
            </label>

            {error ? (
              <p className="mt-3 rounded-lg bg-signal-50 px-3 py-2 text-sm text-signal-800" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="button"
              onClick={checkout}
              disabled={units === 0 || submitting || !checkoutReady}
              className={cn(
                "mt-4 hidden h-12 w-full items-center justify-center rounded-full bg-volt-400 text-base font-semibold text-ink-950 transition-colors lg:flex",
                "hover:bg-volt-500 disabled:cursor-not-allowed disabled:bg-ink-100 disabled:text-ink-400",
              )}
            >
              {submitting ? "Opening secure checkout…" : "Checkout"}
            </button>
            {!checkoutReady ? (
              <p className="mt-2 text-sm text-ink-500">Checkout is unavailable until payments are configured.</p>
            ) : null}
          </div>

          <TestCards />
        </aside>
      </div>

      {/* Phone: a bar that stays in reach of the thumb. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ink-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <a href="#basket" className="min-w-0 flex-1 text-sm">
            <span className="block font-medium text-ink-950">
              {units === 0 ? "Basket is empty" : `${units} item${units === 1 ? "" : "s"} in basket`}
            </span>
            <span className="block text-ink-500 tabular-nums">
              {units === 0 ? "Add something to check out" : formatMoney(total, currency)}
            </span>
          </a>
          <button
            type="button"
            onClick={checkout}
            disabled={units === 0 || submitting || !checkoutReady}
            className="h-12 shrink-0 rounded-full bg-volt-400 px-6 text-base font-semibold text-ink-950 disabled:bg-ink-100 disabled:text-ink-400"
          >
            {submitting ? "Opening…" : "Checkout"}
          </button>
        </div>
      </div>
    </div>
  );
}
