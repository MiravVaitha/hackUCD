import "../setup-env";

import fs from "node:fs";
import path from "node:path";
import { chromium, expect, test, type Page } from "@playwright/test";
import bwipjs from "bwip-js/node";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { evidenceBlobs, evidenceFiles, ledgerEvents, orders, packingSessions } from "@/db/schema";
import { verifyOrderLedger } from "@/lib/ledger/verify";
import {
  cleanupTestOrders,
  createPackableOrder,
  productBarcode,
  trackingNumberFor,
} from "../db/helpers";
import { signInAs } from "./helpers/auth";

test.afterAll(async () => {
  await cleanupTestOrders();
});

async function typeCode(page: Page, code: string) {
  await page.getByRole("button", { name: "Type a code" }).click();
  await page.getByLabel(/The number under the barcode/).fill(code);
  await page.getByRole("button", { name: "Check this code" }).click();
}

test.describe("packing station", () => {
  test("a packer verifies items, photographs the parcel and records the handover", async ({
    page,
    context,
    baseURL,
  }) => {
    test.setTimeout(150_000);
    const order = await createPackableOrder([
      { sku: "VB-EARBUDS-PRO", quantity: 1 },
      { sku: "VB-CABLE-USBC-2M", quantity: 2 },
    ]);
    const tracking = await trackingNumberFor(order.id);
    const earbuds = await productBarcode("VB-EARBUDS-PRO");
    const cable2m = await productBarcode("VB-CABLE-USBC-2M");
    const cable1m = await productBarcode("VB-CABLE-USBC-1M");

    await signInAs(context, "packer", baseURL!);
    await page.goto("/app/pack");
    await page.getByRole("link", { name: new RegExp(order.number) }).click();
    await expect(page.getByRole("heading", { name: "Scan each item" })).toBeVisible();

    // A wrong item stops the packer with a full-screen warning and is not counted.
    await typeCode(page, cable1m);
    const warning = page.getByRole("alertdialog");
    await expect(warning.getByRole("heading", { name: "Wrong item" })).toBeVisible();
    await expect(warning).toContainText("USB-C Cable 1 m is not in order");
    await warning.getByRole("button", { name: "OK, keep scanning" }).click();

    await typeCode(page, earbuds);
    await expect(page.getByText("1/1")).toBeVisible();
    await typeCode(page, cable2m);
    await expect(page.getByText("1/2")).toBeVisible();
    await typeCode(page, cable2m);

    // Contents photo, taken from the (synthetic) camera stream.
    await expect(page.getByRole("heading", { name: "Photograph the open parcel" })).toBeVisible();
    await page.getByRole("button", { name: "Take photo" }).click();

    await expect(page.getByRole("heading", { name: "Seal it, then scan the label" })).toBeVisible();
    await expect(page.getByText(tracking)).toBeVisible();
    await typeCode(page, tracking);

    await expect(page.getByRole("heading", { name: "Photograph the labelled parcel" })).toBeVisible();
    await page.getByRole("button", { name: "Take photo" }).click();

    // A clean order finishes by itself after the last photo.
    await expect(page.getByRole("heading", { name: new RegExp(`${order.number} is packed`) })).toBeVisible();
    await expect(page.getByText("3 of 3 units verified")).toBeVisible();
    await expect(page.getByText(/Packed is not the same as dispatched/)).toBeVisible();

    let [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row.fulfilmentStatus).toBe("packed");

    await page.getByRole("button", { name: "Record handover to the courier" }).click();
    await expect(page.getByText(/Handed to SwiftParcel/)).toBeVisible();
    [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row.fulfilmentStatus).toBe("handed_to_carrier");

    // What was recorded.
    const events = await db
      .select()
      .from(ledgerEvents)
      .where(eq(ledgerEvents.orderId, order.id))
      .orderBy(asc(ledgerEvents.seq));
    expect(events.map((event) => event.type)).toEqual([
      "packing.started",
      "packing.mismatch",
      "packing.item_verified",
      "packing.item_verified",
      "packing.item_verified",
      "packing.contents_photo",
      "packing.label_verified",
      "packing.label_photo",
      "packing.completed",
      "shipment.handed_to_carrier",
    ]);

    const [session] = await db.select().from(packingSessions).where(eq(packingSessions.orderId, order.id));
    expect(session.status).toBe("completed");
    expect(session.packerName).toBe("Niamh Kelly");

    // Both photos are real JPEGs, stored with the hash of their bytes.
    const files = await db.select().from(evidenceFiles).where(eq(evidenceFiles.orderId, order.id));
    expect(files.map((file) => file.kind).sort()).toEqual(["packing_contents_photo", "packing_label_photo"]);
    for (const file of files) {
      expect(file.mime).toBe("image/jpeg");
      expect(file.width).toBeGreaterThan(100);
      const [blob] = await db.select().from(evidenceBlobs).where(eq(evidenceBlobs.fileId, file.id));
      const bytes = Buffer.from(blob.bytes);
      expect(bytes.subarray(0, 2).toString("hex")).toBe("ffd8");
      expect(bytes.length).toBe(file.sizeBytes);
    }
    expect(await verifyOrderLedger(order.id, order.merchantId)).toMatchObject({ ok: true, fileCount: 2 });
  });

  test("the merchant sees the packing evidence and the courier delivers", async ({ page, context, baseURL }) => {
    test.setTimeout(120_000);
    const order = await createPackableOrder([{ sku: "VB-HUB-7IN1", quantity: 1 }]);
    const tracking = await trackingNumberFor(order.id);
    const hub = await productBarcode("VB-HUB-7IN1");

    await signInAs(context, "owner", baseURL!);
    await page.goto(`/app/pack/${order.number}`);
    await expect(page.getByRole("heading", { name: "Scan each item" })).toBeVisible();
    await typeCode(page, hub);
    await page.getByRole("button", { name: "Take photo" }).click();
    await expect(page.getByRole("heading", { name: "Seal it, then scan the label" })).toBeVisible();
    await typeCode(page, tracking);
    await page.getByRole("button", { name: "Take photo" }).click();
    await expect(page.getByRole("heading", { name: /is packed/ })).toBeVisible();

    await page.goto(`/app/orders/${order.number}`);
    await expect(page.getByText("Packed and verified")).toBeVisible();
    await expect(page.getByText("1 of 1 scanned")).toBeVisible();

    // The packing photos load for a signed-in merchant.
    const photo = page.getByRole("img", { name: "Contents before sealing" });
    await expect(photo).toBeVisible();
    const src = await photo.getAttribute("src");
    const image = await page.request.get(src!);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/jpeg");

    // Packed, handed over and delivered are three separate steps.
    await page.getByRole("button", { name: "Record handover to the courier" }).click();
    await expect(page.getByText("Handed to carrier", { exact: true }).first()).toBeVisible();
    await page.getByLabel("Received by").fill("T. Customer");
    await page.getByRole("button", { name: "Mark delivered" }).click();
    await expect(page.getByText("The parcel has been delivered.")).toBeVisible();
    await expect(page.getByText(/signed for by T\. Customer/).first()).toBeVisible();

    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row.fulfilmentStatus).toBe("delivered");
  });

  test("evidence photos are not served without signing in", async ({ request }) => {
    const [file] = await db.select().from(evidenceFiles).limit(1);
    test.skip(!file, "no evidence files yet");
    const response = await request.get(`/api/evidence/files/${file.id}`);
    expect(response.status()).toBe(401);
  });

  test("the camera reads a product barcode held in front of it", async ({ baseURL }) => {
    test.setTimeout(150_000);
    const order = await createPackableOrder([{ sku: "VB-POWERBANK-10K", quantity: 1 }]);
    const barcode = await productBarcode("VB-POWERBANK-10K");

    // Build a one-frame video of the barcode on white paper for Chromium's fake camera.
    const png = await bwipjs.toBuffer({
      bcid: "ean13",
      text: barcode,
      scale: 4,
      height: 24,
      includetext: true,
      backgroundcolor: "FFFFFF",
      paddingwidth: 12,
      paddingheight: 12,
    });
    const videoPath = path.resolve(".data", `fake-camera-${order.number}.mjpeg`);
    fs.mkdirSync(path.dirname(videoPath), { recursive: true });
    const renderer = await chromium.launch();
    const frame = await renderer.newPage({ viewport: { width: 1280, height: 720 } });
    await frame.setContent(
      `<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#e9e6df">
         <img src="data:image/png;base64,${png.toString("base64")}" style="width:520px;background:#fff;padding:24px">
       </body>`,
    );
    fs.writeFileSync(videoPath, await frame.screenshot({ type: "jpeg", quality: 92 }));
    await renderer.close();

    const browser = await chromium.launch({
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        `--use-file-for-fake-video-capture=${videoPath}`,
      ],
    });
    try {
      const context = await browser.newContext({ baseURL, permissions: ["camera"] });
      await signInAs(context, "packer", baseURL!);
      const page = await context.newPage();
      await page.goto(`/app/pack/${order.number}`);

      // No typing: the scan comes from the camera feed.
      await expect(page.getByText("1/1")).toBeVisible({ timeout: 45_000 });
      await expect(page.getByRole("heading", { name: "Photograph the open parcel" })).toBeVisible();

      const events = await db
        .select()
        .from(ledgerEvents)
        .where(eq(ledgerEvents.orderId, order.id))
        .orderBy(asc(ledgerEvents.seq));
      const verified = events.find((event) => event.type === "packing.item_verified");
      expect(verified?.payload).toMatchObject({ barcode, method: "camera" });
      // Held in view, the same barcode is not counted twice.
      expect(events.filter((event) => event.type === "packing.mismatch")).toHaveLength(0);
    } finally {
      await browser.close();
      fs.rmSync(videoPath, { force: true });
    }
  });
});
