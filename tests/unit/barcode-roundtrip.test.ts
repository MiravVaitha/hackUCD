import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import bwipjs from "bwip-js/node";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";

import { catalogBarcode, DEMO_PRODUCTS } from "@/lib/catalog";
import { makeTrackingNumber, orderBarcodeValue, parseOrderBarcode } from "@/lib/packing/barcodes";

/**
 * Renders each kind of code the app prints and reads it back with the same
 * decoder the packing station uses in the browser.
 */
beforeAll(() => {
  const require = createRequire(import.meta.url);
  const entry = require.resolve("zxing-wasm/reader");
  const distDir = entry.slice(0, entry.lastIndexOf(`${path.sep}dist${path.sep}`) + 5);
  const wasm = readFileSync(path.join(distDir, "reader", "zxing_reader.wasm"));
  prepareZXingModule({ overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer } });
});

// A white background with a quiet zone, as on the printed slip and label.
const PAPER = { backgroundcolor: "FFFFFF", paddingwidth: 10, paddingheight: 10 };

async function decode(png: Buffer, formats: ("EAN-13" | "Code128" | "QRCode")[]) {
  const results = await readBarcodes(new Uint8Array(png), { formats, tryHarder: true });
  return results.map((result) => result.text);
}

describe("printed codes can be read back", () => {
  it("reads every product's EAN-13", async () => {
    for (const product of DEMO_PRODUCTS) {
      const code = catalogBarcode(product);
      const png = await bwipjs.toBuffer({ bcid: "ean13", text: code, scale: 3, height: 20, includetext: true, ...PAPER });
      expect(await decode(png, ["EAN-13"]), product.sku).toEqual([code]);
    }
  });

  it("reads the shipping label's Code 128", async () => {
    const tracking = makeTrackingNumber(1042);
    const png = await bwipjs.toBuffer({ bcid: "code128", text: tracking, scale: 3, height: 16, includetext: true, ...PAPER });
    expect(await decode(png, ["Code128"])).toEqual([tracking]);
  });

  it("reads the packing slip's QR code back to the order number", async () => {
    const value = orderBarcodeValue("VB-1042");
    const png = await bwipjs.toBuffer({ bcid: "qrcode", text: value, scale: 4, ...PAPER });
    const [text] = await decode(png, ["QRCode"]);
    expect(text).toBe(value);
    expect(parseOrderBarcode(text)).toBe("VB-1042");
  });
});
