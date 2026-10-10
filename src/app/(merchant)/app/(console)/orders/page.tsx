import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/console/page-header";
import { DisputeBadge, FulfilmentBadge, PaymentBadge } from "@/components/orders/status-badges";
import { Badge, SimulatedBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { CONSOLE_ROLES, requireUser } from "@/lib/auth/guards";
import { listOrders, type OrderListView } from "@/lib/orders/queries";
import { cn, formatDateTime, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Orders" };

const VIEWS: { key: OrderListView; label: string }[] = [
  { key: "all", label: "All orders" },
  { key: "to_pack", label: "To pack" },
  { key: "in_transit", label: "On the way" },
  { key: "attention", label: "Needs attention" },
];

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await requireUser(CONSOLE_ROLES);
  const params = await searchParams;
  const view = VIEWS.some((item) => item.key === params.view) ? (params.view as OrderListView) : "all";
  const orders = await listOrders(session.merchant.id, view);

  return (
    <>
      <PageHeader
        title="Orders"
        description="Every order carries its own evidence record, from checkout to outcome."
        actions={
          <LinkButton href="/store" variant="secondary" target="_blank">
            Place a test order
          </LinkButton>
        }
      />

      <nav className="mb-4 flex gap-1 overflow-x-auto" aria-label="Order views">
        {VIEWS.map((item) => (
          <Link
            key={item.key}
            href={item.key === "all" ? "/app/orders" : `/app/orders?view=${item.key}`}
            aria-current={view === item.key ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-sm transition-colors",
              view === item.key
                ? "bg-ink-950 font-medium text-white"
                : "text-ink-600 hover:bg-ink-100 hover:text-ink-950",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <Card className="overflow-hidden">
        {orders.length === 0 ? (
          <EmptyState
            title={view === "all" ? "No orders yet" : "Nothing in this view"}
            action={
              view === "all" ? (
                <LinkButton href="/store" target="_blank">
                  Open the demo store
                </LinkButton>
              ) : undefined
            }
          >
            {view === "all"
              ? "Place a test order in the demo store and it will appear here with its payment evidence."
              : "Orders appear here as they reach this stage."}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs tracking-wide text-ink-500 uppercase">
                  <th scope="col" className="px-5 py-3 font-medium">
                    Order
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    Customer
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    Items
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">
                    Total
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    Payment
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    Fulfilment
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Record
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orders.map((order) => (
                  <tr key={order.id} className="group relative transition-colors hover:bg-ink-50">
                    <td className="px-5 py-3">
                      <Link
                        href={`/app/orders/${order.number}`}
                        className="font-mono font-medium text-ink-950 after:absolute after:inset-0"
                      >
                        {order.number}
                      </Link>
                      <span className="block text-xs text-ink-500">{formatDateTime(order.placedAt)}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="block text-ink-900">{order.customerName ?? "—"}</span>
                      <span className="block max-w-[14rem] truncate text-xs text-ink-500">{order.customerEmail}</span>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-ink-700">{order.units}</td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums text-ink-950">
                      {formatMoney(order.totalMinor, order.currency)}
                    </td>
                    <td className="px-3 py-3">
                      <PaymentBadge status={order.paymentStatus} />
                    </td>
                    <td className="px-3 py-3">
                      <FulfilmentBadge status={order.fulfilmentStatus} />
                    </td>
                    <td className="px-5 py-3">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-ink-500 tabular-nums">{order.ledgerSeq} entries</span>
                        {order.openComplaints > 0 ? <Badge tone="amber">Complaint open</Badge> : null}
                        {order.openComplaints === 0 && order.totalComplaints > 0 ? (
                          <Badge tone="neutral">Complaint handled</Badge>
                        ) : null}
                        {order.dispute ? (
                          <DisputeBadge stripeStatus={order.dispute.stripeStatus} outcome={order.dispute.outcome} />
                        ) : null}
                        {order.simulated ? <SimulatedBadge /> : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
