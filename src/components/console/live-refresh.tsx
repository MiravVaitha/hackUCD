"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Keeps server-rendered pages current. Polls a small fingerprint endpoint
 * while the tab is visible and refreshes the route when the data changes.
 */
export function LiveRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  const lastVersion = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState === "visible") {
        try {
          const response = await fetch("/api/live", { cache: "no-store" });
          if (response.ok) {
            const data = (await response.json()) as { version?: string };
            if (typeof data.version === "string") {
              if (lastVersion.current !== null && lastVersion.current !== data.version) {
                router.refresh();
              }
              lastVersion.current = data.version;
            }
          }
        } catch {
          // Offline or mid-deploy. Try again on the next tick.
        }
      }
      if (!cancelled) timer = setTimeout(tick, intervalMs);
    };

    void tick();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, router]);

  return null;
}
