import type { Metadata } from "next";

import { SlipScanner } from "@/components/pack/slip-scanner";

export const metadata: Metadata = { title: "Scan a packing slip" };

export default function ScanSlipPage() {
  return <SlipScanner />;
}
