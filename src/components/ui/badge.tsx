import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "seal" | "amber" | "signal" | "transit" | "draft" | "ink";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-ink-100 text-ink-700 ring-ink-200",
  seal: "bg-seal-50 text-seal-800 ring-seal-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  signal: "bg-signal-50 text-signal-800 ring-signal-200",
  transit: "bg-transit-50 text-transit-800 ring-transit-200",
  draft: "bg-draft-50 text-draft-800 ring-draft-200",
  ink: "bg-ink-950 text-white ring-ink-950",
};

type BadgeProps = ComponentProps<"span"> & { tone?: BadgeTone };

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

/** Marks data that came from a demo simulator or seed rather than a real system. */
export function SimulatedBadge({ className }: { className?: string }) {
  return (
    <Badge tone="neutral" className={cn("border border-dashed border-ink-300 bg-transparent ring-0", className)}>
      Simulated
    </Badge>
  );
}
