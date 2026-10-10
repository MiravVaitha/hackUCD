import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  complaints,
  disputes,
  evidenceFiles,
  ledgerEvents,
  orderItems,
  orders,
  packingScans,
  packingSessions,
  payments,
  refunds,
  shipments,
  type Complaint,
  type Dispute,
  type EvidenceFile,
  type LedgerEvent,
  type Order,
  type OrderItem,
  type PackingScan,
  type PackingSession,
  type Payment,
  type Refund,
  type Shipment,
} from "@/db/schema";

export type OrderListRow = Order & {
  units: number;
  lineCount: number;
  openComplaints: number;
  totalComplaints: number;
  dispute: Pick<Dispute, "stripeStatus" | "outcome" | "reason"> | null;
};

export type OrderListView = "all" | "to_pack" | "in_transit" | "attention";

/** Orders a merchant should see. Unpaid and abandoned checkouts are left out. */
export async function listOrders(
  merchantId: string,
  view: OrderListView = "all",
  limit = 200,
): Promise<OrderListRow[]> {
  const conditions = [
    eq(orders.merchantId, merchantId),
    notInArray(orders.paymentStatus, ["pending", "failed"]),
  ];
  if (view === "to_pack") {
    conditions.push(inArray(orders.fulfilmentStatus, ["unfulfilled", "packing"]));
  } else if (view === "in_transit") {
    conditions.push(
      inArray(orders.fulfilmentStatus, ["packed", "handed_to_carrier", "in_transit", "out_for_delivery"]),
    );
  }

  const rows = await db
    .select()
    .from(orders)
    .where(and(...conditions))
    .orderBy(desc(orders.placedAt))
    .limit(limit);
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const [itemTotals, complaintTotals, disputeRows] = await Promise.all([
    db
      .select({
        orderId: orderItems.orderId,
        units: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int`,
        lineCount: sql<number>`count(*)::int`,
      })
      .from(orderItems)
      .where(inArray(orderItems.orderId, ids))
      .groupBy(orderItems.orderId),
    db
      .select({
        orderId: complaints.orderId,
        total: sql<number>`count(*)::int`,
        open: sql<number>`count(*) filter (where ${complaints.status} in ('new', 'investigating', 'awaiting_customer'))::int`,
      })
      .from(complaints)
      .where(inArray(complaints.orderId, ids))
      .groupBy(complaints.orderId),
    db
      .select({
        orderId: disputes.orderId,
        stripeStatus: disputes.stripeStatus,
        outcome: disputes.outcome,
        reason: disputes.reason,
      })
      .from(disputes)
      .where(and(inArray(disputes.orderId, ids), eq(disputes.held, false)))
      .orderBy(asc(disputes.receivedAt)),
  ]);

  const itemsByOrder = new Map(itemTotals.map((row) => [row.orderId, row]));
  const complaintsByOrder = new Map(complaintTotals.map((row) => [row.orderId, row]));
  const disputeByOrder = new Map(disputeRows.map((row) => [row.orderId, row]));

  const result = rows.map((row) => {
    const dispute = disputeByOrder.get(row.id);
    return {
      ...row,
      units: itemsByOrder.get(row.id)?.units ?? 0,
      lineCount: itemsByOrder.get(row.id)?.lineCount ?? 0,
      openComplaints: complaintsByOrder.get(row.id)?.open ?? 0,
      totalComplaints: complaintsByOrder.get(row.id)?.total ?? 0,
      dispute: dispute
        ? { stripeStatus: dispute.stripeStatus, outcome: dispute.outcome, reason: dispute.reason }
        : null,
    };
  });

  if (view === "attention") {
    return result.filter(
      (row) => row.openComplaints > 0 || (row.dispute !== null && row.dispute.outcome === null),
    );
  }
  return result;
}

export type OrderRecord = {
  order: Order;
  items: OrderItem[];
  payments: Payment[];
  refunds: Refund[];
  shipment: Shipment | null;
  packingSessions: (PackingSession & { scans: PackingScan[] })[];
  events: LedgerEvent[];
  files: EvidenceFile[];
  complaints: Complaint[];
  /** Disputes the merchant can see. Demo-held disputes are excluded. */
  disputes: Dispute[];
};

/** Everything attached to one order: the unified evidence record. */
export async function getOrderRecord(
  merchantId: string,
  orderNumber: string,
): Promise<OrderRecord | null> {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.merchantId, merchantId), eq(orders.number, orderNumber.toUpperCase())))
    .limit(1);
  if (!order) return null;
  return loadOrderRecord(order);
}

export async function getOrderRecordById(
  merchantId: string,
  orderId: string,
): Promise<OrderRecord | null> {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.merchantId, merchantId), eq(orders.id, orderId)))
    .limit(1);
  if (!order) return null;
  return loadOrderRecord(order);
}

async function loadOrderRecord(order: Order): Promise<OrderRecord> {
  const [
    items,
    paymentRows,
    refundRows,
    shipmentRows,
    sessionRows,
    events,
    files,
    complaintRows,
    disputeRows,
  ] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.name)),
    db.select().from(payments).where(eq(payments.orderId, order.id)).orderBy(asc(payments.paidAt)),
    db.select().from(refunds).where(eq(refunds.orderId, order.id)).orderBy(asc(refunds.createdAt)),
    db.select().from(shipments).where(eq(shipments.orderId, order.id)).limit(1),
    db
      .select()
      .from(packingSessions)
      .where(eq(packingSessions.orderId, order.id))
      .orderBy(asc(packingSessions.startedAt)),
    db.select().from(ledgerEvents).where(eq(ledgerEvents.orderId, order.id)).orderBy(asc(ledgerEvents.seq)),
    db.select().from(evidenceFiles).where(eq(evidenceFiles.orderId, order.id)).orderBy(asc(evidenceFiles.createdAt)),
    db.select().from(complaints).where(eq(complaints.orderId, order.id)).orderBy(asc(complaints.createdAt)),
    db
      .select()
      .from(disputes)
      .where(and(eq(disputes.orderId, order.id), eq(disputes.held, false)))
      .orderBy(asc(disputes.receivedAt)),
  ]);

  const scans =
    sessionRows.length > 0
      ? await db
          .select()
          .from(packingScans)
          .where(
            inArray(
              packingScans.sessionId,
              sessionRows.map((session) => session.id),
            ),
          )
          .orderBy(asc(packingScans.at))
      : [];

  return {
    order,
    items,
    payments: paymentRows,
    refunds: refundRows,
    shipment: shipmentRows[0] ?? null,
    packingSessions: sessionRows.map((session) => ({
      ...session,
      scans: scans.filter((scan) => scan.sessionId === session.id),
    })),
    events,
    files,
    complaints: complaintRows,
    disputes: disputeRows,
  };
}
