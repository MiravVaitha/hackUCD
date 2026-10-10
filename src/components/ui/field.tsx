import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

// 16px text on small screens stops iOS Safari zooming in when a field is focused.
const control =
  "w-full rounded-lg border border-line-strong bg-white px-3 text-base text-ink-950 sm:text-sm " +
  "placeholder:text-ink-400 transition-colors " +
  "focus:border-transit-600 focus:outline-none focus:ring-2 focus:ring-transit-100 " +
  "disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-28 py-2 leading-relaxed", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(control, "h-10 pr-8", className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("block text-sm font-medium text-ink-800", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-sm text-signal-700" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}
