import type { MerchantSettings, UserRole } from "@/db/schema";
import { demoEan13 } from "@/lib/packing/barcodes";

/**
 * The fictional merchant behind the demo store. Everything here is invented:
 * no real business, people or products.
 */
export const DEMO_MERCHANT = {
  slug: "voltbox",
  name: "Voltbox",
  currency: "eur",
  supportEmail: "help@voltbox.demo",
  settings: {
    orderPrefix: "VB",
    holdTestDisputes: true,
    refundPolicy:
      "Unused items can be returned within 30 days of delivery for a full refund. " +
      "Items that arrive damaged or incorrect are replaced or refunded when reported within 14 days of delivery. " +
      "Refunds are issued to the original payment method within 5 working days of approval.",
    shippingPolicy:
      "Orders are dispatched within 1 working day using tracked delivery. " +
      "Delivery takes 1 to 2 working days in Ireland and 2 to 4 working days in the UK. " +
      "The courier records a delivery scan, and a signature or photo where available.",
    supportSignature: "Voltbox Customer Care",
  } satisfies MerchantSettings,
};

export type ProductArt =
  | "earbuds"
  | "charger"
  | "cable"
  | "powerbank"
  | "case"
  | "pad"
  | "hub"
  | "stand"
  | "box";

export type CatalogProduct = {
  sku: string;
  itemNumber: number;
  name: string;
  description: string;
  priceMinor: number;
  art: ProductArt;
};

export const DEMO_PRODUCTS: CatalogProduct[] = [
  {
    sku: "VB-EARBUDS-PRO",
    itemNumber: 101,
    name: "Pulse Pro Wireless Earbuds",
    description: "Noise-cancelling earbuds with a 30-hour charging case.",
    priceMinor: 8900,
    art: "earbuds",
  },
  {
    sku: "VB-CHARGER-65W",
    itemNumber: 102,
    name: "65W GaN Fast Charger",
    description: "Two-port wall charger for laptops and phones.",
    priceMinor: 3900,
    art: "charger",
  },
  {
    sku: "VB-CABLE-USBC-2M",
    itemNumber: 103,
    name: "USB-C Cable 2 m",
    description: "Braided 100W USB-C to USB-C cable, 2 metres.",
    priceMinor: 1400,
    art: "cable",
  },
  {
    sku: "VB-CABLE-USBC-1M",
    itemNumber: 104,
    name: "USB-C Cable 1 m",
    description: "Braided 100W USB-C to USB-C cable, 1 metre.",
    priceMinor: 1100,
    art: "cable",
  },
  {
    sku: "VB-POWERBANK-10K",
    itemNumber: 105,
    name: "Slim Power Bank 10,000 mAh",
    description: "Pocket power bank with 20W fast charging.",
    priceMinor: 4500,
    art: "powerbank",
  },
  {
    sku: "VB-CASE-EARBUDS",
    itemNumber: 106,
    name: "Earbuds Silicone Case",
    description: "Protective case with carabiner for Pulse Pro earbuds.",
    priceMinor: 1200,
    art: "case",
  },
  {
    sku: "VB-PAD-WIRELESS",
    itemNumber: 107,
    name: "Magnetic Wireless Charging Pad",
    description: "15W magnetic charging pad with a 1.5 m cable.",
    priceMinor: 2900,
    art: "pad",
  },
  {
    sku: "VB-HUB-7IN1",
    itemNumber: 108,
    name: "7-in-1 USB-C Hub",
    description: "HDMI, card reader, three USB ports and pass-through charging.",
    priceMinor: 5900,
    art: "hub",
  },
  {
    sku: "VB-STAND-PHONE",
    itemNumber: 109,
    name: "Aluminium Phone Stand",
    description: "Adjustable desk stand for phones and small tablets.",
    priceMinor: 1900,
    art: "stand",
  },
];

export function catalogBarcode(product: CatalogProduct): string {
  return demoEan13(product.itemNumber);
}

/** Flat tracked-delivery charge on the demo store, in minor units. */
export const DEMO_SHIPPING_MINOR = 495;

export const DEMO_USERS: { email: string; name: string; role: UserRole }[] = [
  { email: "owner@voltbox.demo", name: "Aoife Byrne", role: "owner" },
  { email: "support@voltbox.demo", name: "Cian Murphy", role: "agent" },
  { email: "packer@voltbox.demo", name: "Niamh Kelly", role: "packer" },
];

export const DEMO_CARRIER = {
  name: "SwiftParcel",
  service: "Tracked 48",
};
