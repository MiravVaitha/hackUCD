import { describe, expect, it } from "vitest";

import type { Order } from "@/db/schema";
import { buildLifecycle } from "@/lib/orders/lifecycle";

const order = { paymentStatus: "paid", simulated: false } as Order;
const types = (...names: string[]) => names.map((type) => ({ type }));
const byKey = (steps: ReturnType<typeof buildLifecycle>) =>
  Object.fromEntries(steps.map((step) => [step.key, step]));

describe("order lifecycle", () => {
  it("covers the whole lifecycle in order", () => {
    const steps = buildLifecycle({ order, events: [], complaints: [], disputes: [] });
    expect(steps.map((step) => step.key)).toEqual([
      "checkout",
      "payment",
      "packing",
      "dispatch",
      "delivery",
      "complaint",
      "resolution",
      "outcome",
    ]);
  });

  it("keeps packed, handed over and delivered as separate states", () => {
    const packed = byKey(
      buildLifecycle({
        order,
        events: types("order.placed", "payment.succeeded", "packing.started", "packing.completed"),
        complaints: [],
        disputes: [],
      }),
    );
    expect(packed.packing.state).toBe("done");
    expect(packed.dispatch.state).toBe("idle");
    expect(packed.dispatch.detail).toBe("Awaiting collection");
    expect(packed.delivery.state).toBe("idle");

    const handedOver = byKey(
      buildLifecycle({
        order,
        events: types("packing.completed", "shipment.handed_to_carrier"),
        complaints: [],
        disputes: [],
      }),
    );
    expect(handedOver.dispatch.state).toBe("done");
    expect(handedOver.delivery.state).toBe("active");
    expect(handedOver.delivery.detail).toBe("In transit");
  });

  it("shows a complaint resolved without a dispute as its own outcome", () => {
    const steps = byKey(
      buildLifecycle({
        order,
        events: types("shipment.delivered"),
        complaints: [{ status: "resolved", resolution: "clarified" }],
        disputes: [],
      }),
    );
    expect(steps.resolution.detail).toBe("Resolved with the customer");
    expect(steps.outcome.detail).toBe("No dispute filed");
  });

  it("marks an open chargeback as a problem and a won one as done", () => {
    const open = byKey(
      buildLifecycle({
        order,
        events: [],
        complaints: [{ status: "escalated", resolution: null }],
        disputes: [{ stripeStatus: "needs_response", outcome: null, isInquiry: false }],
      }),
    );
    expect(open.resolution.label).toBe("Chargeback");
    expect(open.resolution.state).toBe("problem");
    expect(open.outcome.detail).toBe("Awaiting response");

    const won = byKey(
      buildLifecycle({
        order,
        events: [],
        complaints: [],
        disputes: [{ stripeStatus: "won", outcome: "won", isInquiry: false }],
      }),
    );
    expect(won.outcome.state).toBe("done");
    expect(won.outcome.detail).toBe("Dispute won");
  });

  it("does not call an order with nothing raised 'open'", () => {
    const steps = byKey(buildLifecycle({ order, events: [], complaints: [], disputes: [] }));
    expect(steps.outcome.detail).toBe("Nothing raised");
  });
});
