import bwipjs from "bwip-js/node";

import { cn } from "@/lib/utils";

export type BarcodeKind = "ean13" | "code128" | "qr";

function render(kind: BarcodeKind, value: string): string | null {
  try {
    if (kind === "qr") {
      return bwipjs.toSVG({ bcid: "qrcode", text: value, scale: 4 });
    }
    if (kind === "ean13") {
      // The symbology's own text layout places the digits between the guard bars.
      return bwipjs.toSVG({ bcid: "ean13", text: value, scale: 3, height: 20, includetext: true });
    }
    return bwipjs.toSVG({
      bcid: "code128",
      text: value,
      scale: 3,
      height: 16,
      includetext: true,
      textxalign: "center",
      textsize: 10,
    });
  } catch {
    return null;
  }
}

/**
 * A scannable barcode drawn as SVG on the server. Always on a white panel with
 * a quiet zone around it, which scanners need, even inside dark layouts.
 */
export function Barcode({
  kind,
  value,
  className,
  label,
}: {
  kind: BarcodeKind;
  value: string;
  className?: string;
  /** Read by screen readers. Defaults to the encoded value. */
  label?: string;
}) {
  const svg = render(kind, value);
  if (!svg) {
    return (
      <span className={cn("block rounded-lg bg-white p-3 font-mono text-sm text-ink-950", className)}>{value}</span>
    );
  }
  return (
    <span
      role="img"
      aria-label={label ?? `Barcode ${value}`}
      className={cn(
        "block rounded-lg bg-white [&>svg]:block [&>svg]:h-auto [&>svg]:w-full",
        kind === "qr" ? "p-3" : "px-4 py-3",
        className,
      )}
      // The markup comes from the barcode library and encodes only our own order, product and tracking codes.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
