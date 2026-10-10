import type { Metadata } from "next";

import { PackingFlow } from "@/components/pack/packing-flow";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ number: string }>;
}): Promise<Metadata> {
  const { number } = await params;
  return { title: `Packing ${number.toUpperCase()}` };
}

/**
 * The packing screen for one order. The session is started from the browser
 * once the page is open, never while rendering, so a prefetch cannot start it.
 */
export default async function PackOrderPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  return <PackingFlow orderNumber={number.toUpperCase()} />;
}
