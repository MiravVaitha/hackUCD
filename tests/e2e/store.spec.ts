import "../setup-env";

import { expect, test } from "@playwright/test";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { accessLogs, ledgerEvents, orders, payments, shipments } from "@/db/schema";
import { verifyOrderLedger } from "@/lib/ledger/verify";
import { signInAs } from "./helpers/auth";
import { buyFromStore } from "./helpers/checkout";

test.describe.serial("demo store to evidence record", () => {
  let orderNumber = "";

  test("a purchase through Stripe Checkout lands in the evidence ledger", async ({ page }) => {
    test.setTimeout(240_000);

    orderNumber = await buyFromStore(page, ["VB-EARBUDS-PRO", "VB-CABLE-USBC-2M"]);

    const [order] = await db.select().from(orders).where(eq(orders.number, orderNumber)).limit(1);
    expect(order).toBeTruthy();
    expect(order.paymentStatus).toBe("paid");
    expect(order.fulfilmentStatus).toBe("unfulfilled");
    expect(order.totalMinor).toBe(8900 + 1400 + 495);
    expect(order.customerEmail).toBe("saoirse.doyle@example.com");
    expect(order.shippingAddress?.line1).toBe("14 Harbour Road");

    const [payment] = await db.select().from(payments).where(eq(payments.orderId, order.id)).limit(1);
    expect(payment.provider).toBe("stripe");
    expect(payment.cardLast4).toBe("4242");
    expect(payment.cvcCheck).toBe("pass");
    expect(payment.paymentIntentId).toMatch(/^pi_/);
    expect(payment.livemode).toBe(false);

    const [shipment] = await db.select().from(shipments).where(eq(shipments.orderId, order.id)).limit(1);
    expect(shipment.trackingNumber).toMatch(/^SWP\d{7}IE$/);

    const events = await db
      .select()
      .from(ledgerEvents)
      .where(eq(ledgerEvents.orderId, order.id))
      .orderBy(asc(ledgerEvents.seq));
    expect(events.map((event) => event.type)).toEqual([
      "order.placed",
      "payment.succeeded",
      "shipment.label_created",
    ]);
    // Card numbers are never stored: only brand and last four digits.
    expect(JSON.stringify(events)).not.toContain("4242424242424242");

    const report = await verifyOrderLedger(order.id, order.merchantId);
    expect(report).toMatchObject({ ok: true, eventCount: 3 });

    // Reloading the confirmation page must not record the payment twice.
    await page.reload();
    await expect(page.getByRole("heading", { name: /Your order is confirmed/ })).toBeVisible();
    const paymentRows = await db.select().from(payments).where(eq(payments.orderId, order.id));
    expect(paymentRows).toHaveLength(1);
    const [after] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(after.ledgerSeq).toBe(3);
  });

  test("the merchant sees the order's evidence record and can verify and export it", async ({
    page,
    context,
    baseURL,
  }) => {
    expect(orderNumber, "the purchase test must run first").not.toBe("");
    await signInAs(context, "agent", baseURL!);

    await page.goto("/app/orders");
    await page.getByRole("link", { name: orderNumber }).click();
    await expect(page).toHaveURL(new RegExp(`/app/orders/${orderNumber}$`));

    // Every section of the unified record is present.
    for (const heading of [
      "Evidence timeline",
      "Items ordered",
      "Customer",
      "Payment",
      "Packing",
      "Courier",
      "Customer interactions",
      "Chargeback",
    ]) {
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }
    await expect(page.getByText("Payment succeeded", { exact: true })).toBeVisible();
    // Shown in the timeline entry and again in the payment section.
    await expect(page.getByText("VISA ending 4242").first()).toBeVisible();
    await expect(page.getByText("CVC passed", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Verify integrity" }).click();
    await expect(page.getByText("No changes detected.")).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Evidence report" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`${orderNumber}-evidence-report.pdf`);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).subarray(0, 5).toString("latin1")).toBe("%PDF-");

    // The export is written to the access log.
    const [order] = await db.select().from(orders).where(eq(orders.number, orderNumber)).limit(1);
    const logged = await db.select().from(accessLogs).where(eq(accessLogs.orderId, order.id));
    expect(logged.some((entry) => entry.action === "download_order_report")).toBe(true);
  });

  test("the evidence report is not available without signing in", async ({ request }) => {
    const response = await request.get(`/api/orders/${orderNumber || "VB-1"}/report`);
    expect(response.status()).toBe(401);
  });

  test("checkout rejects a basket the catalogue does not recognise", async ({ request }) => {
    const response = await request.post("/api/store/checkout", {
      data: { items: [{ sku: "NOT-A-REAL-SKU", quantity: 1 }] },
    });
    expect(response.status()).toBe(400);

    const tooMany = await request.post("/api/store/checkout", {
      data: { items: [{ sku: "VB-CABLE-USBC-2M", quantity: 500 }] },
    });
    expect(tooMany.status()).toBe(400);

    const empty = await request.post("/api/store/checkout", { data: { items: [] } });
    expect(empty.status()).toBe(400);
  });
});
