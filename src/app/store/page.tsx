import { SetupNotice } from "@/components/setup-notice";
import { Storefront } from "@/components/store/storefront";
import { DEMO_SHIPPING_MINOR } from "@/lib/catalog";
import { isDatabaseConfigured, isStripeConfigured } from "@/lib/env";
import { getStoreMerchant, getStoreProducts } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function StorePage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string }>;
}) {
  const { cancelled } = await searchParams;
  const merchant = isDatabaseConfigured() ? await getStoreMerchant() : null;

  if (!merchant) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-8">
        <h1 className="text-2xl font-semibold text-ink-950">The store is not open yet</h1>
        <p className="mt-2 text-ink-600">This deployment is still being set up.</p>
        <SetupNotice className="mt-6" />
      </div>
    );
  }

  const products = await getStoreProducts(merchant.id);

  return (
    <Storefront
      products={products.map((product) => ({
        sku: product.sku,
        name: product.name,
        description: product.description,
        priceMinor: product.priceMinor,
        art: product.art,
      }))}
      currency={merchant.currency}
      shippingMinor={DEMO_SHIPPING_MINOR}
      checkoutReady={isStripeConfigured()}
      cancelled={cancelled === "1"}
    />
  );
}
