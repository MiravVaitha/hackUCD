"use client";

import { ArrowLeft, Camera, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { PackingState } from "@/lib/packing/service";
import { useBarcodeScanner, useBeeper, useCamera, useScannerKeyboard } from "./camera";

/** Scan a packing slip to open its order on the packing screen. */
export function SlipScanner() {
  const router = useRouter();
  const { videoRef, attachVideo, status: cameraStatus, start: startCamera } = useCamera();
  const beep = useBeeper();
  const [message, setMessage] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    void startCamera();
  }, [startCamera]);

  const onCode = useCallback(
    async (code: string) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const response = await fetch("/api/pack/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, station: window.localStorage.getItem("proofshield.station") ?? "Station 1" }),
        });
        const data = (await response.json().catch(() => ({}))) as { state?: PackingState; error?: string };
        if (!response.ok || !data.state) {
          beep("error");
          setMessage(data.error ?? "That code is not a packing slip.");
          busy.current = false;
          return;
        }
        beep("ok");
        setOpening(true);
        router.push(`/app/pack/${data.state.orderNumber}`);
      } catch {
        setMessage("No connection. Try again.");
        busy.current = false;
      }
    },
    [beep, router],
  );

  const scanner = useBarcodeScanner({ videoRef: videoRef, active: cameraStatus === "ready" && !opening, onCode });
  useScannerKeyboard(onCode, !opening);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center gap-3 pb-3">
        <Link
          href="/app/pack"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10"
          aria-label="Back to the queue"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <h1 className="text-lg font-semibold">Scan a packing slip</h1>
      </header>

      <div className="relative aspect-[3/4] max-h-[62dvh] overflow-hidden rounded-2xl bg-black">
        <video ref={attachVideo} className="h-full w-full object-cover" playsInline muted autoPlay />
        {cameraStatus !== "ready" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink-900 px-6 text-center">
            {cameraStatus === "starting" || cameraStatus === "idle" ? (
              <p className="flex items-center text-sm text-ink-300">
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Starting the camera…
              </p>
            ) : (
              <>
                <Camera className="h-8 w-8 text-ink-400" aria-hidden="true" />
                <p className="text-sm text-ink-200">
                  {cameraStatus === "denied"
                    ? "Camera access is blocked for this site. Allow it in the browser settings, or type the order number on the previous screen."
                    : "No camera is available here. Type the order number on the previous screen."}
                </p>
                <button type="button" onClick={() => void startCamera()} className="rounded-full bg-white px-4 py-2 text-sm font-medium text-ink-950">
                  Try the camera again
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/70" aria-hidden="true" />
        )}
      </div>

      <p className="mt-4 text-center text-sm text-ink-300" role="status">
        {opening
          ? "Opening the order…"
          : (message ??
            (scanner.failed
              ? "The scanner could not load. Type the order number instead."
              : "Point the camera at the code on the packing slip."))}
      </p>
    </div>
  );
}
