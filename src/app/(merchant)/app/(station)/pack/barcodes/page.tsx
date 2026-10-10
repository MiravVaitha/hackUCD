import type { Metadata } from "next";
import Link from "next/link";

import { Barcode } from "@/components/barcode";
import { ProductArt } from "@/components/store/product-art";
import { requireUser } from "@/lib/auth/guards";
import { getOrderRecord } from "@/lib/orders/queries";
import { orderBarcodeValue } from "@/lib/packing/barcodes";
import { listPackQueue } from "@/lib/packing/service";
import { getStoreProducts } from "@/lib/store";

export const metadata: Metadata = { title: "Demo barcodes" };

function Step({
  number,
  title,
  children,
  note,
}: {
  number: number;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="break-inside-avoid rounded-2xl border border-line bg-white p-5 shadow-card">
      <h2 className="flex items-center gap-3 text-lg font-semibold text-ink-950">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-950 text-sm text-white">
          {number}
        </span>
        {title}
      </h2>
      {note ? <p className="mt-1 pl-11 text-sm text-ink-500">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * Stand-ins for the things a packer scans: the packing slip, product
 * packaging and the shipping label. Shown on a second screen so the phone at
 * the packing station can scan them during a demo.
 */
export default async function DemoBarcodesPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const session = await requireUser();
  const params = await searchParams;
  const record = params.order ? await getOrderRecord(session.merchant.id, params.order) : null;
  const [products, queue] = await Promise.all([
    getStoreProducts(session.merchant.id),
    listPackQueue(session.merchant.id),
  ]);

  const orderSkus = new Set(record?.items.map((item) => item.sku) ?? []);
  const decoy =
    products.find((product) => product.sku === "VB-CABLE-USBC-1M" && !orderSkus.has(product.sku)) ??
    products.find((product) => !orderSkus.has(product.sku));

  return (
    <div className="min-h-dvh bg-paper text-ink-950">
      <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
        <p className="text-sm font-medium tracking-wide text-ink-500 uppercase">Demo aid</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {record ? (
            <>
              Barcodes for order <span className="font-mono">{record.order.number}</span>
            </>
          ) : (
            "Demo barcodes"
          )}
        </h1>
        <p className="mt-2 max-w-2xl text-ink-600">
          In a real warehouse these codes are on the packing slip, the product packaging and the shipping label. Here
          they are on one page, so the phone at the packing station can scan them from this screen.
        </p>

        {record ? (
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <Step number={1} title="Packing slip" note="Scan this from the station's queue to open the order.">
              <Barcode kind="qr" value={orderBarcodeValue(record.order.number)} className="mx-auto max-w-[200px]" />
              <p className="mt-2 text-center font-mono text-sm text-ink-600">{record.order.number}</p>
            </Step>

            <Step number={2} title="The items" note="Scan each one. For a quantity of two, scan it, move away, and scan again.">
              <ul className="space-y-4">
                {record.items.map((item) => (
                  <li key={item.id}>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ProductArt art={item.art} size="thumb" className="h-8 w-8" />
                      {item.name}
                      <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-700">× {item.quantity}</span>
                    </div>
                    <Barcode kind="ean13" value={item.barcode} className="mt-2 max-w-[300px]" />
                  </li>
                ))}
              </ul>
            </Step>

            {decoy ? (
              <Step
                number={3}
                title="A wrong item"
                note="Not in this order. Scan it to see the warning the packer gets."
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ProductArt art={decoy.art} size="thumb" className="h-8 w-8" />
                  {decoy.name}
                </div>
                <Barcode kind="ean13" value={decoy.barcode} className="mt-2 max-w-[300px]" />
              </Step>
            ) : null}

            {record.shipment ? (
              <Step number={4} title="Shipping label" note="Scan after the photo of the open parcel.">
                <Barcode kind="code128" value={record.shipment.trackingNumber} className="max-w-[340px]" />
                <p className="mt-2 text-sm text-ink-600">
                  {record.shipment.carrier} {record.shipment.service}
                </p>
              </Step>
            ) : null}
          </div>
        ) : (
          <>
            <section className="mt-8">
              <h2 className="text-lg font-semibold">Pick an order</h2>
              {queue.length === 0 ? (
                <p className="mt-2 text-sm text-ink-500">
                  No orders are waiting to be packed. Place one in the{" "}
                  <Link href="/store" className="font-medium text-transit-700 underline underline-offset-2">
                    demo store
                  </Link>
                  .
                </p>
              ) : (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {queue.map(({ order }) => (
                    <li key={order.id}>
                      <Link
                        href={`/app/pack/barcodes?order=${order.number}`}
                        className="inline-flex h-10 items-center rounded-full border border-line-strong bg-white px-4 font-mono text-sm font-medium hover:bg-ink-50"
                      >
                        {order.number}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-10">
              <h2 className="text-lg font-semibold">All products</h2>
              <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((product) => (
                  <li key={product.id} className="break-inside-avoid rounded-2xl border border-line bg-white p-4 shadow-card">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ProductArt art={product.art} size="thumb" className="h-8 w-8" />
                      {product.name}
                    </div>
                    <Barcode kind="ean13" value={product.barcode} className="mt-3" />
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
