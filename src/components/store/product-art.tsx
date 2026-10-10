import { cn } from "@/lib/utils";

const TILES: Record<string, string> = {
  earbuds: "bg-[#e8f0ff] text-[#1d3fa8]",
  charger: "bg-[#fff3d6] text-[#8a5a0b]",
  cable: "bg-[#e6f6ee] text-[#0b5e49]",
  powerbank: "bg-[#f3e9ff] text-[#5b2fa8]",
  case: "bg-[#ffe9e3] text-[#a3341c]",
  pad: "bg-[#e3f4fb] text-[#12607f]",
  hub: "bg-[#eef0f4] text-[#293655]",
  stand: "bg-[#fdf0e0] text-[#8a4a0b]",
  box: "bg-ink-100 text-ink-700",
};

function Drawing({ art }: { art: string }) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const soft = { fill: "currentColor", opacity: 0.14 };

  switch (art) {
    case "earbuds":
      return (
        <>
          <rect x="22" y="62" width="76" height="40" rx="18" {...soft} />
          <rect x="22" y="62" width="76" height="40" rx="18" {...stroke} />
          <path d="M22 78h76" {...stroke} />
          <circle cx="44" cy="34" r="12" {...stroke} />
          <path d="M44 46v12" {...stroke} />
          <circle cx="78" cy="34" r="12" {...stroke} />
          <path d="M78 46v12" {...stroke} />
        </>
      );
    case "charger":
      return (
        <>
          <rect x="30" y="38" width="60" height="62" rx="12" {...soft} />
          <rect x="30" y="38" width="60" height="62" rx="12" {...stroke} />
          <path d="M48 38V20M72 38V20" {...stroke} />
          <rect x="44" y="78" width="12" height="8" rx="3" {...stroke} />
          <rect x="64" y="78" width="12" height="8" rx="3" {...stroke} />
          <path d="M63 50 54 64h12l-9 13" {...stroke} />
        </>
      );
    case "cable":
      return (
        <>
          <circle cx="60" cy="62" r="30" {...soft} />
          <path d="M34 62a26 26 0 1 1 52 0c0 14-10 22-22 22S44 76 44 66s8-14 16-14 12 5 12 11" {...stroke} />
          <rect x="18" y="18" width="16" height="24" rx="4" {...stroke} />
          <path d="M26 42v10" {...stroke} />
          <rect x="86" y="80" width="16" height="24" rx="4" {...stroke} />
          <path d="M94 80V70" {...stroke} />
        </>
      );
    case "powerbank":
      return (
        <>
          <rect x="34" y="16" width="52" height="88" rx="12" {...soft} />
          <rect x="34" y="16" width="52" height="88" rx="12" {...stroke} />
          <path d="M64 40 52 58h16L56 78" {...stroke} />
          <circle cx="50" cy="92" r="2.5" fill="currentColor" />
          <circle cx="60" cy="92" r="2.5" fill="currentColor" />
          <circle cx="70" cy="92" r="2.5" fill="currentColor" />
        </>
      );
    case "case":
      return (
        <>
          <rect x="26" y="46" width="68" height="54" rx="20" {...soft} />
          <rect x="26" y="46" width="68" height="54" rx="20" {...stroke} />
          <path d="M26 68h68" {...stroke} />
          <path d="M60 46V34" {...stroke} />
          <rect x="48" y="12" width="24" height="24" rx="12" {...stroke} />
          <circle cx="60" cy="82" r="3" fill="currentColor" />
        </>
      );
    case "pad":
      return (
        <>
          <circle cx="54" cy="56" r="36" {...soft} />
          <circle cx="54" cy="56" r="36" {...stroke} />
          <circle cx="54" cy="56" r="18" {...stroke} />
          <path d="M84 78c10 6 18 12 18 22" {...stroke} />
        </>
      );
    case "hub":
      return (
        <>
          <rect x="14" y="44" width="92" height="34" rx="10" {...soft} />
          <rect x="14" y="44" width="92" height="34" rx="10" {...stroke} />
          <rect x="26" y="56" width="14" height="10" rx="2" {...stroke} />
          <rect x="48" y="56" width="14" height="10" rx="2" {...stroke} />
          <rect x="70" y="56" width="24" height="10" rx="2" {...stroke} />
          <path d="M60 44V28c0-8 6-12 14-12h10" {...stroke} />
        </>
      );
    case "stand":
      return (
        <>
          <path d="M40 22h34l-12 62H28z" {...soft} />
          <path d="M40 22h34l-12 62H28z" {...stroke} />
          <path d="M28 84 24 100h72" {...stroke} />
          <path d="M70 60 92 100" {...stroke} />
          <path d="M50 34h12" {...stroke} />
        </>
      );
    default:
      return (
        <>
          <path d="M20 42 60 22l40 20v44L60 104 20 86z" {...soft} />
          <path d="M20 42 60 22l40 20v44L60 104 20 86z" {...stroke} />
          <path d="M20 42 60 62l40-20M60 62v42" {...stroke} />
        </>
      );
  }
}

/** Built-in illustration for a product. No external images are used. */
export function ProductArt({
  art,
  className,
  size = "tile",
}: {
  art: string;
  className?: string;
  size?: "tile" | "thumb";
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center overflow-hidden",
        size === "tile" ? "aspect-[4/3] rounded-xl" : "h-11 w-11 shrink-0 rounded-lg",
        TILES[art] ?? TILES.box,
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 120 120" className={size === "tile" ? "h-[62%]" : "h-8 w-8"}>
        <Drawing art={art} />
      </svg>
    </div>
  );
}
