"use client";

import { useEffect } from "react";

import { clearCart } from "./cart-store";

/** Empties the basket once an order has gone through. */
export function ClearCart() {
  useEffect(() => {
    clearCart();
  }, []);
  return null;
}
