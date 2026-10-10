import { Check, X } from "lucide-react";

import type { LifecycleStep } from "@/lib/orders/lifecycle";
import { cn } from "@/lib/utils";

const dot = {
  done: "border-seal-600 bg-seal-600 text-white",
  active: "border-transit-600 bg-white text-transit-600",
  problem: "border-signal-600 bg-signal-600 text-white",
  idle: "border-ink-200 bg-white text-ink-300",
};

const line = {
  done: "bg-seal-500",
  active: "bg-transit-200",
  problem: "bg-signal-200",
  idle: "bg-ink-200",
};

const detailTone = {
  done: "text-seal-700",
  active: "text-transit-700",
  problem: "text-signal-700",
  idle: "text-ink-400",
};

/** The order's position across the whole lifecycle, from checkout to outcome. */
export function LifecycleStrip({ steps }: { steps: LifecycleStep[] }) {
  return (
    <ol className="flex overflow-x-auto pb-1" aria-label="Order lifecycle">
      {steps.map((step, index) => (
        <li key={step.key} className="relative min-w-[92px] flex-1">
          {index > 0 ? (
            <span
              className={cn("absolute top-[11px] right-1/2 left-[-50%] h-0.5", line[step.state])}
              aria-hidden="true"
            />
          ) : null}
          <div className="relative flex flex-col items-center text-center">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full border-2",
                dot[step.state],
              )}
            >
              {step.state === "done" ? (
                <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
              ) : step.state === "problem" ? (
                <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
              ) : step.state === "active" ? (
                <span className="h-2 w-2 rounded-full bg-transit-600" aria-hidden="true" />
              ) : null}
            </span>
            <span className="mt-2 text-[13px] font-medium text-ink-900">{step.label}</span>
            <span className={cn("mt-0.5 px-1 text-xs leading-tight", detailTone[step.state])}>
              {step.detail}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
