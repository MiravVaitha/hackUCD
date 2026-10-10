import { Download, Printer } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/console/page-header";
import { LedgerTimeline } from "@/components/ledger/timeline";
import { VerifyLedger } from "@/components/ledger/verify-ledger";
import { LifecycleStrip } from "@/components/orders/lifecycle-strip";
import {
  ChargebackSection,
  CourierSection,
  CustomerSection,
  InteractionsSection,
  PackingSection,
  PaymentSection,
} from "@/components/orders/sections";
import { FulfilmentBadge, PaymentBadge } from "@/components/orders/status-badges";
import { ProductArt } from "@/components/store/product-art";
import { SimulatedBadge } from "@/components/ui/badge";
import { buttonClasses, LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CourierControls } from "@/components/orders/courier-controls";
import { CONSOLE_ROLES, requireUser } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { getCustomerHistory } from "@/lib/orders/history";
import { buildLifecycle } from "@/lib/orders/lifecycle";
import { getOrderRecord } from "@/lib/orders/queries";
import { orderSourceLabel } from "@/lib/orders/source";
import { formatDateTime, formatMoney } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ number: string }>;
}): Promise<Metadata> {
  const { number } = await params;
  return { title: `Order ${number.toUpperCase()}` };
}

/** "Saoirse Doyle" becomes "S. Doyle", the way a courier records who took the parcel. */
function receivedBy(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}

export default async function OrderPage({ params }: { params: Promise<{ number: string }> }) {
  const session = await requireUser(CONSOLE_ROLES);
  const { number } = await params;
  const record = await getOrderRecord(session.merchant.id, number);
  if (!record) notFound();

  const { order, items, events, files } = record;
  const history = await getCustomerHistory(session.merchant.id, order.customerEmail, order);
  const lifecycle = buildLifecycle(record);

  return (
    <>
      <PageHeader
        back={{ href: "/app/orders", label: "Orders" }}
        title={
          <>
            Order <span className="font-mono">{order.number}</span>
          </>
        }
        description={`Placed ${formatDateTime(order.placedAt)} · ${orderSourceLabel(order.source)}`}
        meta={
          <>
            <PaymentBadge status={order.paymentStatus} />
            <FulfilmentBadge status={order.fulfilmentStatus} />
            {order.simulated ? <SimulatedBadge /> : null}
          </>
        }
        actions={
          <>
            <LinkButton href={`/app/orders/${order.number}/print`} variant="secondary" target="_blank">
              <Printer className="h-4 w-4" aria-hidden="true" /> Slip and label
            </LinkButton>
            <a href={`/api/orders/${order.number}/report`} className={buttonClasses({ variant: "primary" })}>
              <Download className="h-4 w-4" aria-hidden="true" /> Evidence report
            </a>
          </>
        }
      />

      <Card className="mb-6">
        <CardBody className="py-5">
          <LifecycleStrip steps={lifecycle} />
        </CardBody>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Evidence timeline"
              description={`${events.length} entr${events.length === 1 ? "y" : "ies"}, in the order they happened. Each keeps its source reference.`}
            />
            <LedgerTimeline events={events} files={files} />
            <VerifyLedger orderId={order.id} headHash={order.ledgerHeadHash} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Items ordered" />
            <CardBody>
              <ul className="space-y-3">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3">
                    <ProductArt art={item.art} size="thumb" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-950">{item.name}</p>
                      <p className="font-mono text-[11px] text-ink-500">
                        {item.sku} · {item.barcode}
                      </p>
                    </div>
                    <span className="text-sm text-ink-600 tabular-nums">
                      {item.quantity} × {formatMoney(item.unitPriceMinor, order.currency)}
                    </span>
                  </li>
                ))}
              </ul>
              <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
                <div className="flex justify-between text-ink-600">
                  <dt>Subtotal</dt>
                  <dd className="tabular-nums">{formatMoney(order.subtotalMinor, order.currency)}</dd>
                </div>
                <div className="flex justify-between text-ink-600">
                  <dt>Delivery</dt>
                  <dd className="tabular-nums">{formatMoney(order.shippingMinor, order.currency)}</dd>
                </div>
                <div className="flex justify-between font-semibold text-ink-950">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatMoney(order.totalMinor, order.currency)}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          <CustomerSection record={record} history={history} />
          <PaymentSection record={record} />
          <PackingSection record={record} />
          <CourierSection
            record={record}
            controls={
              env.demoMode && record.shipment ? (
                <CourierControls
                  orderId={order.id}
                  fulfilmentStatus={order.fulfilmentStatus}
                  defaultSignedBy={receivedBy(order.customerName)}
                />
              ) : undefined
            }
          />
          <InteractionsSection record={record} />
          <ChargebackSection record={record} />
        </div>
      </div>
    </>
  );
}
