import { describe, expect, it } from "vitest";

import { catalogBarcode, DEMO_PRODUCTS } from "@/lib/catalog";
import {
  demoEan13,
  ean13CheckDigit,
  isValidEan13,
  makeEan13,
  makeTrackingNumber,
  normaliseProductCode,
  normaliseTrackingCode,
  orderBarcodeValue,
  parseOrderBarcode,
} from "@/lib/packing/barcodes";

describe("EAN-13", () => {
  it("computes known check digits", () => {
    // Published examples.
    expect(ean13CheckDigit("400638133393")).toBe(1);
    expect(ean13CheckDigit("590123412345")).toBe(7);
    expect(makeEan13("978030640615")).toBe("9780306406157");
  });

  it("validates and rejects", () => {
    expect(isValidEan13("4006381333931")).toBe(true);
    expect(isValidEan13("4006381333932")).toBe(false);
    expect(isValidEan13("400638133393")).toBe(false);
    expect(isValidEan13("40063813339AB")).toBe(false);
  });

  it("generates demo codes in the in-store range", () => {
    const code = demoEan13(103);
    expect(code).toMatch(/^200\d{10}$/);
    expect(isValidEan13(code)).toBe(true);
  });

  it("gives every catalogue product a unique, valid barcode", () => {
    const codes = DEMO_PRODUCTS.map(catalogBarcode);
    expect(new Set(codes).size).toBe(DEMO_PRODUCTS.length);
    for (const code of codes) expect(isValidEan13(code)).toBe(true);
  });

  it("pads a 12-digit UPC-A read to EAN-13", () => {
    expect(normaliseProductCode("200000000103")).toBe("0200000000103");
    expect(normaliseProductCode(" 2000000001037 ")).toBe("2000000001037");
  });
});

describe("order and tracking codes", () => {
  it("round-trips the packing slip value", () => {
    expect(parseOrderBarcode(orderBarcodeValue("VB-1042"))).toBe("VB-1042");
  });

  it("accepts a typed order number in any case", () => {
    expect(parseOrderBarcode(" vb-1042 ")).toBe("VB-1042");
  });

  it("does not mistake a product barcode for an order", () => {
    expect(parseOrderBarcode("2000000001037")).toBeNull();
    expect(parseOrderBarcode("SWP0001042IE")).toBeNull();
  });

  it("formats and normalises tracking numbers", () => {
    expect(makeTrackingNumber(1042)).toBe("SWP0001042IE");
    expect(normaliseTrackingCode(" swp0001042ie ")).toBe("SWP0001042IE");
  });
});
