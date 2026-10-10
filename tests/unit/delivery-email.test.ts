import { describe, expect, it } from "vitest";
import { parseDeliveryEmail } from "@/lib/delivery/parse-email";
describe("delivery email extraction", () => {
  it("extracts labelled fields without inventing missing details", () => {
    expect(parseDeliveryEmail("DHL\nOrder: VB-1001\nTracking number: 1234567890\nStatus: Delivered\nDelivery date: 2026-10-09")).toEqual({ carrier: "DHL", orderNumber: "VB-1001", tracking: "1234567890", status: "delivered", reportedDate: "2026-10-09" });
    expect(parseDeliveryEmail("Your parcel will be delivered tomorrow").status).toBe("unknown");
    expect(parseDeliveryEmail("Hello").tracking).toBe("");
  });
  it("does not turn negation or future delivery into delivered", () => {
    expect(parseDeliveryEmail("DPD: Your parcel was not delivered").status).toBe("exception");
    expect(parseDeliveryEmail("Your parcel is out for delivery").status).toBe("out_for_delivery");
    expect(parseDeliveryEmail("Status: In transit\nPrevious email: successfully delivered").status).toBe("in_transit");
  });
});
