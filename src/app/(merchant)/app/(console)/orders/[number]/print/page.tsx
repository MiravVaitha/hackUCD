import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Barcode } from "@/components/barcode";
import { PageHeader } from "@/components/console/page-header";
import { PrintButton } from "@/components/print-button";
import { CONSOLE_ROLES, requireUser } from "@/lib/auth/guards";
import { getOrderRecord } from "@/lib/orders/queries";
import { orderBarcodeValue } from "@/lib/packing/barcodes";
import { formatAddress, formatDate } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ number: string }>;
}): Promise<Metadata> {
  const { number } = await params;
  return { title: `Slip and label ${number.toUpperCase()}` };
}

/** Packing slip and shipping label for one order, laid out for printing. */
export default async function PrintOrderPage({ params }: { params: Promise<{ number: string }> }) {
  const session = await requireUser(CONSOLE_ROLES);
  const { number } = await params;
  const record = await getOrderRecord(session.merchant.id, number);
  if (!record) notFound();

  const { order, items, shipment } = record;
  const address = formatAddress(order.shippingAddress);

  return (
    <>
      <PageHeader
        back={{ href: `/app/orders/${order.number}`, label: `Order ${order.number}` }}
        title="Packing slip and shipping label"
        description="The slip goes in the box. The label goes on it once the box is sealed."
        actions={<PrintButton label="Print both" />}
      />

      <div className="space-y-6 print:space-y-0">
        {/* Packing slip */}
        <article className="mx-auto w-full max-w-2xl rounded-xl border border-line bg-white p-8 shadow-card print:max-w-none print:break-after-page print:rounded-none print:border-0 print:p-0 print:shadow-none">
          <header className="flex items-start justify-between gap-6">
            <div>
              <p className="text-2xl font-semibold tracking-tight">{session.merchant.name}</p>
              <p className="mt-1 text-sm text-ink-500">Packing slip</p>
              <dl className="mt-5 space-y-1 text-sm">
                <div className="flex gap-2">
                  <dt className="w-24 text-ink-500">Order</dt>
                  <dd className="font-mono font-semibold">{order.number}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 text-ink-500">Placed</dt>
                  <dd>{formatDate(order.placedAt)}</dd>
                </div>
              </dl>
            </div>
            <div className="w-32 shrink-0 text-center">
              <Barcode kind="qr" value={orderBarcodeValue(order.number)} className="border border-line" />
              <p className="mt-1 text-[11px] text-ink-500">Scan to start packing</p>
            </div>
          </header>

          <div className="mt-6">
            <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">Deliver to</p>
            <address className="mt-1 text-sm not-italic">
              {address.length > 0 ? address.map((line) => <span key={line} className="block">{line}</span>) : "No address recorded"}
            </address>
          </div>

          <table className="mt-6 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink-950 text-xs tracking-wide text-ink-500 uppercase">
                <th scope="col" className="py-2 font-medium">Item</th>
                <th scope="col" className="py-2 font-medium">SKU</th>
                <th scope="col" className="py-2 text-right font-medium">Qty</th>
                <th scope="col" className="w-16 py-2 text-right font-medium">Packed</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-line">
                  <td className="py-2.5">{item.name}</td>
                  <td className="py-2.5 font-mono text-xs">{item.sku}</td>
                  <td className="py-2.5 text-right font-semibold tabular-nums">{item.quantity}</td>
                  <td className="py-2.5">
                    <span className="ml-auto block h-4 w-4 rounded border border-ink-400" aria-hidden="true" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-6 text-xs text-ink-500">
            Something not right with your order? Reply to your confirmation email or visit the help page, quoting{" "}
            {order.number}.
          </p>
        </article>

        {/* Shipping label */}
        {shipment ? (
          <article className="mx-auto w-full max-w-sm rounded-xl border-2 border-ink-950 bg-white p-5 print:mt-0 print:rounded-none">
            <header className="flex items-center justify-between border-b-2 border-ink-950 pb-3">
              <p className="text-xl font-bold tracking-tight">{shipment.carrier}</p>
              <p className="rounded bg-ink-950 px-2 py-1 text-sm font-semibold text-white">{shipment.service}</p>
            </header>
            <div className="py-4">
              <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">Deliver to</p>
              <address className="mt-1 text-lg leading-snug font-medium not-italic">
                {address.length > 0 ? address.map((line) => <span key={line} className="block">{line}</span>) : "No address recorded"}
              </address>
            </div>
            <div className="border-t-2 border-ink-950 pt-4">
              <Barcode kind="code128" value={shipment.trackingNumber} />
              <div className="mt-3 flex items-end justify-between text-xs text-ink-600">
                <p>
                  From {session.merchant.name}
                  <span className="block font-mono">Order {order.number}</span>
                </p>
                {shipment.simulated ? <p className="text-ink-400">Demo label, not valid for posting</p> : null}
              </div>
            </div>
          </article>
        ) : (
          <p className="text-center text-sm text-ink-500">No shipping label has been created for this order.</p>
        )}
      </div>
    </>
  );
}
