/**
 * Barcode value helpers shared by the catalogue, labels and packing station.
 * Rendering lives in the UI; this file only deals with the encoded values.
 */

/** Check digit for the first 12 digits of an EAN-13. */
export function ean13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) {
    throw new Error("EAN-13 needs exactly 12 digits before the check digit");
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = first12.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function makeEan13(first12: string): string {
  return first12 + ean13CheckDigit(first12);
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/**
 * Demo product barcode. The 200-299 prefix range is reserved for in-store
 * use, so these never collide with a real manufacturer's GTIN.
 */
export function demoEan13(itemNumber: number): string {
  return makeEan13("200" + String(itemNumber).padStart(9, "0"));
}

const ORDER_PREFIX = "PS-ORDER:";

/** Value encoded in the QR code on a packing slip. */
export function orderBarcodeValue(orderNumber: string): string {
  return ORDER_PREFIX + orderNumber;
}

/** Accepts the slip QR value or a bare order number typed by hand. */
export function parseOrderBarcode(code: string): string | null {
  const trimmed = code.trim();
  if (trimmed.toUpperCase().startsWith(ORDER_PREFIX)) {
    const value = trimmed.slice(ORDER_PREFIX.length).trim();
    return value ? value.toUpperCase() : null;
  }
  return /^[A-Za-z]{1,4}-\d{3,8}$/.test(trimmed) ? trimmed.toUpperCase() : null;
}

/** Scanners sometimes read a UPC-A (12 digits) for an EAN-13 with a leading 0. */
export function normaliseProductCode(code: string): string {
  const trimmed = code.trim();
  if (/^\d{12}$/.test(trimmed)) return "0" + trimmed;
  return trimmed;
}

/** Demo courier tracking number, e.g. SWP0001042IE. */
export function makeTrackingNumber(sequence: number): string {
  return `SWP${String(sequence).padStart(7, "0")}IE`;
}

export function normaliseTrackingCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}
