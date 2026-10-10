"use client";

import { useSyncExternalStore } from "react";

/** Basket contents: quantity per SKU. Kept in localStorage so it survives the trip to Checkout. */
export type Cart = Readonly<Record<string, number>>;

const STORAGE_KEY = "voltbox.cart.v1";
const EMPTY: Cart = Object.freeze({});
const MAX_QUANTITY = 10;

const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedCart: Cart = EMPTY;

function parse(raw: string | null): Cart {
  if (!raw) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return EMPTY;
    const cart: Record<string, number> = {};
    for (const [sku, quantity] of Object.entries(value as Record<string, unknown>)) {
      if (typeof quantity === "number" && Number.isInteger(quantity) && quantity > 0) {
        cart[sku] = Math.min(quantity, MAX_QUANTITY);
      }
    }
    return Object.keys(cart).length ? cart : EMPTY;
  } catch {
    return EMPTY;
  }
}

function getSnapshot(): Cart {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable in private browsing; treat as an empty basket.
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedCart = parse(raw);
  }
  return cachedCart;
}

function getServerSnapshot(): Cart {
  return EMPTY;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function write(cart: Record<string, number>): void {
  try {
    if (Object.keys(cart).length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  } catch {
    // Ignore: the basket simply will not persist.
  }
  for (const listener of listeners) listener();
}

export function useCart(): Cart {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setQuantity(sku: string, quantity: number): void {
  const next: Record<string, number> = { ...getSnapshot() };
  const clamped = Math.max(0, Math.min(MAX_QUANTITY, Math.round(quantity)));
  if (clamped === 0) delete next[sku];
  else next[sku] = clamped;
  write(next);
}

export function clearCart(): void {
  write({});
}

export const CART_MAX_QUANTITY = MAX_QUANTITY;
