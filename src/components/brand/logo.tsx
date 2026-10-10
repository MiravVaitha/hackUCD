import { cn } from "@/lib/utils";

/** Shield outline with two chain links: evidence that is linked together. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("h-7 w-7", className)}
    >
      <path
        d="M16 2.5 5 6.4v8.3c0 6.5 4.4 12 11 14.8 6.6-2.8 11-8.3 11-14.8V6.4L16 2.5Z"
        className="fill-seal-600"
      />
      <path
        d="M13.2 17.9h-1.1a3.1 3.1 0 0 1 0-6.2h2.8a3.1 3.1 0 0 1 3 2.3M18.8 13.7h1.1a3.1 3.1 0 0 1 0 6.2h-2.8a3.1 3.1 0 0 1-3-2.3"
        stroke="#fff"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({
  className,
  tone = "dark",
}: {
  className?: string;
  /** "dark" for light backgrounds, "light" for ink backgrounds. */
  tone?: "dark" | "light";
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span
        className={cn(
          "text-[17px] font-semibold tracking-tight",
          tone === "light" ? "text-white" : "text-ink-950",
        )}
      >
        ProofShield
        <span className={cn("ml-1 font-normal", tone === "light" ? "text-ink-300" : "text-ink-500")}>
          AI
        </span>
      </span>
    </span>
  );
}
