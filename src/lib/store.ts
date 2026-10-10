import { and, asc, eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db/client";
import { merchants, products, type Merchant, type Product } from "@/db/schema";
import { DEMO_MERCHANT } from "@/lib/catalog";

/** The merchant behind the public demo store. */
export const getStoreMerchant = cache(async (): Promise<Merchant | null> => {
  const [merchant] = await db
    .select()
    .from(merchants)
    .where(eq(merchants.slug, DEMO_MERCHANT.slug))
    .limit(1);
  return merchant ?? null;
});

export async function getStoreProducts(merchantId: string): Promise<Product[]> {
  return db
    .select()
    .from(products)
    .where(and(eq(products.merchantId, merchantId), eq(products.active, true)))
    .orderBy(asc(products.sortOrder));
}

/** The origin a request was made to, as the browser sees it. */
export function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const host = forwardedHost ?? request.headers.get("host") ?? url.host;
  const protocol = forwardedProto ?? url.protocol.replace(":", "");
  return `${protocol}://${host}`;
}
