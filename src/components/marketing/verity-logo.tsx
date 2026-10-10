import { cn } from "@/lib/utils";

/** Verity brand colours. */
export const VERITY_RED = "#C92A2E";
export const VERITY_RED_DARK = "#8C1C13";

/** Rounded seal with a tick that reads as a V: a fact that has been checked. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("h-7 w-7 shrink-0", className)}
    >
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" fill={VERITY_RED} />
      <path d="M30.5 18v4.5a8 8 0 0 1-8 8H18l12.5-12.5Z" fill={VERITY_RED_DARK} />
      <path
        d="M8.6 10.4 14.3 21.6 23.6 8.6"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({
  className,
  tone = "dark",
}: {
  className?: string;
  /** "dark" for light backgrounds, "light" for dark backgrounds. */
  tone?: "dark" | "light";
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span
        className={cn(
          "text-[18px] font-semibold tracking-tight",
          tone === "light" ? "text-white" : "text-[#212529]",
        )}
      >
        Verity
      </span>
    </span>
  );
}
