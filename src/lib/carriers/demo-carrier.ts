import { and, eq } from "drizzle-orm";

import { db, type Tx } from "@/db/client";
import { orders, shipments, type FulfilmentStatus, type ProofOfDelivery } from "@/db/schema";
import type { SessionContext } from "@/lib/auth/session";
import { appendLedgerEvent } from "@/lib/ledger/append";
import { formatAddress } from "@/lib/utils";

/**
 * The demo courier. There is no real carrier behind it: tracking events are
 * produced by the controls in the app and are always flagged as simulated.
 *
 * A real carrier adapter would implement the same two ideas: create a
 * shipment with a tracking number, and feed tracking events into the ledger.
 * The handover is different: it is the merchant's own record of giving the
 * parcel to the driver, so it is a real entry attributed to a person.
 */

export type CarrierStep = "in_transit" | "out_for_delivery" | "delivered" | "exception";

export class CarrierError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "CarrierError";
  }
}

const ORDER_OF_STEPS = ["label_created", "handed_to_carrier", "in_transit", "out_for_delivery", "delivered"];

async function loadForUpdate(tx: Tx, merchantId: string, orderId: string) {
  const [order] = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.merchantId, merchantId)))
    .for("update");
  if (!order) throw new CarrierError("That order could not be found.", 404);
  const [shipment] = await tx.select().from(shipments).where(eq(shipments.orderId, order.id)).limit(1);
  if (!shipment) throw new CarrierError("This order has no shipping label yet.", 409);
  return { order, shipment };
}

/** The merchant's own record that the parcel left their hands. */
export async function recordHandover(context: SessionContext, orderId: string): Promise<void> {
  const merchantId = context.merchant.id;
  await db.transaction(async (tx) => {
    const { order, shipment } = await loadForUpdate(tx, merchantId, orderId);
    if (order.fulfilmentStatus !== "packed") {
      throw new CarrierError(
        order.fulfilmentStatus === "unfulfilled" || order.fulfilmentStatus === "packing"
          ? "Pack the order before handing it to the carrier."
          : "This parcel has already been handed over.",
        409,
      );
    }

    const now = new Date();
    await tx
      .update(shipments)
      .set({ status: "handed_to_carrier", handedToCarrierAt: now })
      .where(eq(shipments.id, shipment.id));
    await tx
      .update(orders)
      .set({ fulfilmentStatus: "handed_to_carrier", handedToCarrierAt: now })
      .where(eq(orders.id, order.id));

    await appendLedgerEvent(
      {
        merchantId,
        orderId: order.id,
        type: "shipment.handed_to_carrier",
        occurredAt: now,
        actor: { type: "user", id: context.user.id, label: context.user.name },
        source: "merchant_app",
        sourceRef: shipment.trackingNumber,
        summary: `Parcel ${shipment.trackingNumber} handed to ${shipment.carrier}, recorded by ${context.user.name}.`,
        payload: {
          carrier: shipment.carrier,
          service: shipment.service,
          trackingNumber: shipment.trackingNumber,
          recordedBy: context.user.name,
        },
      },
      tx,
    );
  });
}

export type DeliveryDetails = {
  method?: ProofOfDelivery["method"];
  signedBy?: string;
  note?: string;
};

const STEP_STATUS: Record<CarrierStep, FulfilmentStatus> = {
  in_transit: "in_transit",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
  exception: "exception",
};

/** Produce one simulated tracking event from the demo courier. */
export async function simulateCarrierEvent(
  context: SessionContext,
  orderId: string,
  step: CarrierStep,
  delivery: DeliveryDetails = {},
): Promise<void> {
  const merchantId = context.merchant.id;
  await db.transaction(async (tx) => {
    const { order, shipment } = await loadForUpdate(tx, merchantId, orderId);

    const current = ORDER_OF_STEPS.indexOf(shipment.status);
    if (shipment.status === "delivered") throw new CarrierError("This parcel has already been delivered.", 409);
    if (current < ORDER_OF_STEPS.indexOf("handed_to_carrier") && shipment.status !== "exception") {
      throw new CarrierError("Hand the parcel to the carrier first.", 409);
    }
    if (step !== "exception" && ORDER_OF_STEPS.indexOf(step) <= current) {
      throw new CarrierError("The parcel is already past that point.", 409);
    }

    const now = new Date();
    const city = order.shippingAddress?.city ?? "the destination";
    let summary: string;
    let type: "shipment.in_transit" | "shipment.out_for_delivery" | "shipment.delivered" | "shipment.exception";
    const payload: Record<string, unknown> = {
      carrier: shipment.carrier,
      trackingNumber: shipment.trackingNumber,
      triggeredBy: context.user.name,
    };
    let proofOfDelivery: ProofOfDelivery | null = shipment.proofOfDelivery ?? null;

    switch (step) {
      case "in_transit":
        type = "shipment.in_transit";
        summary = `${shipment.carrier} accepted parcel ${shipment.trackingNumber} at its depot. In transit.`;
        payload.location = "Dublin depot";
        break;
      case "out_for_delivery":
        type = "shipment.out_for_delivery";
        summary = `Parcel ${shipment.trackingNumber} is out for delivery in ${city}.`;
        payload.location = city;
        break;
      case "delivered": {
        type = "shipment.delivered";
        const method = delivery.method ?? "signature";
        const signedBy = delivery.signedBy?.trim().slice(0, 80) || undefined;
        const note = delivery.note?.trim().slice(0, 200) || undefined;
        proofOfDelivery = { method, signedBy, note };
        const how =
          method === "signature"
            ? `signed for${signedBy ? ` by ${signedBy}` : ""}`
            : method === "handed_to_resident"
              ? `handed to a resident${signedBy ? ` (${signedBy})` : ""}`
              : method === "safe_place"
                ? "left in a safe place"
                : "photographed at the door";
        summary =
          `${shipment.carrier} delivered parcel ${shipment.trackingNumber} to ` +
          `${formatAddress(order.shippingAddress).slice(1).join(", ") || "the shipping address"}; ${how}.` +
          (note ? ` Driver note: ${note}` : "");
        payload.proofOfDelivery = proofOfDelivery;
        payload.deliveredTo = order.shippingAddress ?? null;
        break;
      }
      case "exception":
        type = "shipment.exception";
        summary =
          `${shipment.carrier} reported a delivery problem for parcel ${shipment.trackingNumber}` +
          (delivery.note ? `: ${delivery.note.trim().slice(0, 200)}` : ".");
        payload.note = delivery.note ?? null;
        break;
    }

    await tx
      .update(shipments)
      .set({
        status: step,
        deliveredAt: step === "delivered" ? now : shipment.deliveredAt,
        proofOfDelivery,
      })
      .where(eq(shipments.id, shipment.id));
    await tx
      .update(orders)
      .set({
        fulfilmentStatus: STEP_STATUS[step],
        deliveredAt: step === "delivered" ? now : order.deliveredAt,
      })
      .where(eq(orders.id, order.id));

    await appendLedgerEvent(
      {
        merchantId,
        orderId: order.id,
        type,
        occurredAt: now,
        actor: { type: "integration", label: `${shipment.carrier} (demo courier)` },
        source: "carrier:demo",
        sourceRef: shipment.trackingNumber,
        summary,
        payload,
        simulated: true,
      },
      tx,
    );
  });
}
