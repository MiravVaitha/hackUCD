"use client";

import {
  Landmark,
  LayoutDashboard,
  LogOut,
  MessagesSquare,
  Package,
  ScanBarcode,
  Settings,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { logoutAction } from "@/app/login/actions";
import { Logo } from "@/components/brand/logo";
import type { UserRole } from "@/db/schema";
import type { NavCounts } from "@/lib/console/nav-counts";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  countTone?: "amber" | "signal" | "neutral";
  ownerOnly?: boolean;
  /** Match only the exact path rather than everything beneath it. */
  exact?: boolean;
};

const countTones = {
  amber: "bg-amber-500 text-ink-950",
  signal: "bg-signal-500 text-white",
  neutral: "bg-ink-700 text-ink-100",
};

export function ConsoleNav({
  user,
  merchantName,
  counts,
}: {
  user: { name: string; email: string; role: UserRole };
  merchantName: string;
  counts: NavCounts;
}) {
  const pathname = usePathname();

  const items: NavItem[] = [
    { href: "/app", label: "Overview", icon: LayoutDashboard, exact: true },
    { href: "/app/orders", label: "Orders", icon: Package },
    {
      href: "/app/complaints",
      label: "Complaints",
      icon: MessagesSquare,
      count: counts.openComplaints,
      countTone: "amber",
    },
    {
      href: "/app/disputes",
      label: "Disputes",
      icon: Landmark,
      count: counts.disputesToAnswer,
      countTone: "signal",
    },
    {
      href: "/app/pack",
      label: "Packing station",
      icon: ScanBarcode,
      count: counts.toPack,
      countTone: "neutral",
    },
    { href: "/app/settings", label: "Settings", icon: Settings, ownerOnly: true },
  ];
  const visible = items.filter((item) => !item.ownerOnly || user.role === "owner");

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-screen flex-col bg-ink-950 text-ink-200 lg:flex">
        <div className="px-5 pt-6 pb-5">
          <Link href="/app" aria-label="ProofShield overview">
            <Logo tone="light" />
          </Link>
          <p className="mt-4 flex items-center justify-between text-sm">
            <span className="font-medium text-white">{merchantName}</span>
            <span className="rounded-full border border-dashed border-ink-500 px-2 py-0.5 text-[11px] text-ink-300">
              Test data
            </span>
          </p>
        </div>

        <nav className="flex-1 space-y-0.5 px-3" aria-label="Main">
          {visible.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-white/10 font-medium text-white"
                    : "text-ink-300 hover:bg-white/5 hover:text-white",
                )}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                <span className="flex-1">{item.label}</span>
                {item.count ? (
                  <span
                    className={cn(
                      "min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-semibold",
                      countTones[item.countTone ?? "neutral"],
                    )}
                  >
                    {item.count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <p className="truncate text-sm font-medium text-white">{user.name}</p>
          <p className="truncate text-xs text-ink-400">{user.email}</p>
          <form action={logoutAction} className="mt-3">
            <button
              type="submit"
              className="flex items-center gap-2 text-sm text-ink-300 transition-colors hover:text-white"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="no-print sticky top-0 z-30 bg-ink-950 text-ink-200 lg:hidden">
        <div className="flex items-center justify-between px-4 pt-3">
          <Link href="/app" aria-label="ProofShield overview">
            <Logo tone="light" />
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-ink-300 hover:text-white"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
            </button>
          </form>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 py-2" aria-label="Main">
          {visible.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm",
                  active ? "bg-white/10 font-medium text-white" : "text-ink-300",
                )}
              >
                {item.label}
                {item.count ? (
                  <span
                    className={cn(
                      "min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-semibold",
                      countTones[item.countTone ?? "neutral"],
                    )}
                  >
                    {item.count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}
