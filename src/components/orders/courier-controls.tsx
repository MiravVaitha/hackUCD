"use client";

import { useState, useTransition } from "react";

import {
  handoverOrderAction,
  simulateCarrierAction,
  type ActionResult,
} from "@/app/(merchant)/app/(console)/orders/actions";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import type { FulfilmentStatus } from "@/db/schema";

/**
 * Demo controls for the simulated courier. The handover is the merchant's own
 * record; everything after it is a simulated tracking event.
 */
export function CourierControls({
  orderId,
  fulfilmentStatus,
  defaultSignedBy,
}: {
  orderId: string;
  fulfilmentStatus: FulfilmentStatus;
  defaultSignedBy: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState("signature");
  const [signedBy, setSignedBy] = useState(defaultSignedBy);

  const run = (action: () => Promise<ActionResult>) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
    });
  };

  const beforeHandover = fulfilmentStatus === "unfulfilled" || fulfilmentStatus === "packing";
  const delivered = fulfilmentStatus === "delivered";

  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">Demo courier</p>
      <p className="mt-1 text-sm text-ink-500">
        There is no real carrier behind this demo. These buttons stand in for its tracking scans, and what they
        record is marked as simulated.
      </p>

      {beforeHandover ? (
        <p className="mt-3 text-sm text-ink-600">Pack the order first. The courier can only take a packed parcel.</p>
      ) : delivered ? (
        <p className="mt-3 text-sm text-seal-700">The parcel has been delivered.</p>
      ) : fulfilmentStatus === "packed" ? (
        <div className="mt-3">
          <Button variant="secondary" disabled={pending} onClick={() => run(() => handoverOrderAction(orderId))}>
            {pending ? "Recording…" : "Record handover to the courier"}
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {fulfilmentStatus === "handed_to_carrier" ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => run(() => simulateCarrierAction(orderId, "in_transit"))}
              >
                Depot scan: in transit
              </Button>
            ) : null}
            {fulfilmentStatus === "handed_to_carrier" || fulfilmentStatus === "in_transit" ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => run(() => simulateCarrierAction(orderId, "out_for_delivery"))}
              >
                Out for delivery
              </Button>
            ) : null}
          </div>

          <div className="rounded-lg border border-line p-3">
            <p className="text-sm font-medium text-ink-900">Deliver the parcel</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <label htmlFor="pod-method" className="text-xs text-ink-500">
                  Proof of delivery
                </label>
                <Select id="pod-method" value={method} onChange={(event) => setMethod(event.target.value)}>
                  <option value="signature">Signature</option>
                  <option value="handed_to_resident">Handed to a resident</option>
                  <option value="safe_place">Left in a safe place</option>
                </Select>
              </div>
              <div>
                <label htmlFor="pod-name" className="text-xs text-ink-500">
                  Received by
                </label>
                <Input
                  id="pod-name"
                  value={signedBy}
                  onChange={(event) => setSignedBy(event.target.value)}
                  disabled={method === "safe_place"}
                  maxLength={80}
                />
              </div>
            </div>
            <Button
              className="mt-3"
              variant="seal"
              size="sm"
              disabled={pending}
              onClick={() =>
                run(() =>
                  simulateCarrierAction(orderId, "delivered", {
                    method,
                    signedBy: method === "safe_place" ? undefined : signedBy,
                  }),
                )
              }
            >
              {pending ? "Recording…" : "Mark delivered"}
            </Button>
          </div>
        </div>
      )}

      {error ? (
        <p className="mt-3 rounded-lg bg-signal-50 px-3 py-2 text-sm text-signal-800" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
