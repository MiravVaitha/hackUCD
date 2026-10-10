"use client";

import {
  ArrowLeft,
  Camera,
  Check,
  CircleHelp,
  Keyboard,
  LoaderCircle,
  PackageCheck,
  ScanBarcode,
  Tag,
  TriangleAlert,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { ProductArt } from "@/components/store/product-art";
import type { ScanMethod } from "@/db/schema";
import type { OverrideInput, PackingState, PackingStep, ScanOutcome } from "@/lib/packing/service";
import { cn, formatDuration } from "@/lib/utils";
import {
  cameraProblem,
  photoFromFile,
  useBarcodeScanner,
  useBeeper,
  useCamera,
  useScannerKeyboard,
  useWakeLock,
  type CapturedPhoto,
} from "./camera";

const STATION_KEY = "proofshield.station";

const STEPS: { key: PackingStep; label: string }[] = [
  { key: "items", label: "Items" },
  { key: "contents_photo", label: "Photo" },
  { key: "label", label: "Label" },
  { key: "label_photo", label: "Photo" },
];

const INSTRUCTIONS: Record<PackingStep, { title: string; hint: string }> = {
  items: { title: "Scan each item", hint: "Hold the barcode in front of the camera as it goes in the box." },
  contents_photo: { title: "Photograph the open parcel", hint: "Everything in the box, before you seal it." },
  label: { title: "Seal it, then scan the label", hint: "Checks the label belongs to this order." },
  label_photo: { title: "Photograph the labelled parcel", hint: "The sealed box with its label showing." },
  review: { title: "Check and finish", hint: "This order has an override, so confirm before finishing." },
  done: { title: "Packed", hint: "" },
};

const QUICK_REASONS = ["Barcode will not scan", "Item out of stock", "Camera not working", "Label damaged"];

type Flash = { tone: "ok" | "error"; title: string; message: string; id: number };

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "That did not work. Try again.");
  return data;
}

function Elapsed({ since, until }: { since: string; until: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);

  const end = until ? new Date(until).getTime() : now;
  const seconds = Math.max(0, Math.floor((end - new Date(since).getTime()) / 1000));
  const text = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <span className="font-mono text-sm text-ink-300 tabular-nums" aria-label="Time spent packing">
      {text}
    </span>
  );
}

function StepBar({ step }: { step: PackingStep }) {
  const index = step === "review" || step === "done" ? STEPS.length : STEPS.findIndex((item) => item.key === step);
  return (
    <ol className="flex gap-1.5 px-4" aria-label="Packing steps">
      {STEPS.map((item, position) => {
        const state = position < index ? "done" : position === index ? "current" : "todo";
        return (
          <li key={item.key} className="flex-1" aria-current={state === "current" ? "step" : undefined}>
            <span
              className={cn(
                "block h-1.5 rounded-full",
                state === "done" ? "bg-seal-500" : state === "current" ? "bg-white" : "bg-ink-700",
              )}
            />
            <span
              className={cn(
                "mt-1 block text-center text-[11px] font-medium tracking-wide uppercase",
                state === "todo" ? "text-ink-500" : "text-ink-200",
              )}
            >
              {item.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function PackingFlow({ orderNumber }: { orderNumber: string }) {
  const [state, setState] = useState<PackingState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [warning, setWarning] = useState<{ title: string; message: string } | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "photo" | "complete" | "override" | "handover">(null);
  const [sheet, setSheet] = useState<null | "type" | "help">(null);

  const { videoRef, attachVideo, status: cameraStatus, start: startCamera, capture: capturePhoto } = useCamera();
  const beep = useBeeper();
  const sessionIdRef = useRef<string | null>(null);
  const scanInFlight = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const step = state?.step ?? "items";
  const inProgress = state?.status === "in_progress";
  const scanning = Boolean(inProgress && (step === "items" || step === "label") && !warning && !sheet);

  useWakeLock(Boolean(inProgress));

  // Start or resume the packing session, and turn the camera on.
  useEffect(() => {
    let cancelled = false;
    const station = window.localStorage.getItem(STATION_KEY) ?? "Station 1";
    postJson<{ state: PackingState }>("/api/pack/sessions", { orderNumber, station })
      .then((data) => {
        if (cancelled) return;
        sessionIdRef.current = data.state.sessionId;
        setState(data.state);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setLoadError(caught instanceof Error ? caught.message : "This order could not be opened.");
      });
    return () => {
      cancelled = true;
    };
  }, [orderNumber]);

  useEffect(() => {
    void startCamera();
  }, [startCamera]);

  const complete = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    setBusy("complete");
    setError(null);
    try {
      const data = await postJson<{ state: PackingState }>(`/api/pack/sessions/${sessionId}/complete`, {});
      setState(data.state);
      beep("ok");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Packing could not be completed.");
    } finally {
      setBusy(null);
    }
  }, [beep]);

  /** Apply a new state. A clean order finishes itself; one with an override waits for a person. */
  const advance = useCallback(
    async (next: PackingState) => {
      setState(next);
      if (next.status === "in_progress" && next.step === "review" && !next.exceptions.some((entry) => entry.overridden)) {
        await complete();
      }
    },
    [complete],
  );

  const handleCode = useCallback(
    async (code: string, method: ScanMethod) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId || scanInFlight.current) return;
      scanInFlight.current = true;
      setError(null);
      try {
        const outcome = await postJson<ScanOutcome>(`/api/pack/sessions/${sessionId}/scan`, { code, method });
        setState(outcome.state);
        if (outcome.ok) {
          beep("ok");
          setFlash({ tone: "ok", title: outcome.title, message: outcome.message, id: Date.now() });
        } else {
          beep("error");
          setWarning({ title: outcome.title, message: outcome.message });
        }
      } catch (caught) {
        beep("error");
        setError(caught instanceof Error ? caught.message : "That scan was not saved. Try again.");
      } finally {
        scanInFlight.current = false;
      }
    },
    [beep],
  );

  const onCameraCode = useCallback((code: string) => void handleCode(code, "camera"), [handleCode]);
  const onScannerCode = useCallback((code: string) => void handleCode(code, "scanner"), [handleCode]);

  const scanner = useBarcodeScanner({ videoRef: videoRef, active: scanning && cameraStatus === "ready", onCode: onCameraCode });
  useScannerKeyboard(onScannerCode, scanning);

  const savePhoto = useCallback(
    async (kind: "contents" | "label", provided?: CapturedPhoto) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      setBusy("photo");
      setError(null);
      try {
        const photo = provided ?? (await capturePhoto());
        const params = new URLSearchParams({
          kind,
          w: String(photo.width),
          h: String(photo.height),
          capturedAt: new Date().toISOString(),
        });
        const response = await fetch(`/api/pack/sessions/${sessionId}/photo?${params}`, {
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body: photo.blob,
        });
        const data = (await response.json().catch(() => ({}))) as { state?: PackingState; error?: string };
        if (!response.ok || !data.state) throw new Error(data.error ?? "The photo was not saved. Try again.");
        beep("ok");
        setFlash({ tone: "ok", title: "Photo saved", message: "Hashed and stored with the order.", id: Date.now() });
        setBusy(null);
        await advance(data.state);
      } catch (caught) {
        beep("error");
        setError(caught instanceof Error ? caught.message : "The photo was not saved. Try again.");
        setBusy(null);
      }
    },
    [advance, beep, capturePhoto],
  );

  const photoKind = step === "label_photo" ? "label" : "contents";

  const onFileChosen = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      await savePhoto(photoKind, await photoFromFile(file));
    } catch {
      setError("That photo could not be read. Take it again, or choose a JPEG or PNG.");
    }
  };

  const submitOverride = async (input: OverrideInput) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    setBusy("override");
    setError(null);
    try {
      const data = await postJson<{ state: PackingState }>(`/api/pack/sessions/${sessionId}/override`, input);
      setSheet(null);
      setBusy(null);
      await advance(data.state);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The override was not saved.");
      setBusy(null);
    }
  };

  const handover = async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    setBusy("handover");
    setError(null);
    try {
      const data = await postJson<{ state: PackingState }>(`/api/pack/sessions/${sessionId}/complete`, {
        handover: true,
      });
      setState(data.state);
      beep("ok");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The handover was not recorded.");
    } finally {
      setBusy(null);
    }
  };

  // --- Loading and failure states -------------------------------------------

  if (loadError) {
    return (
      <Frame>
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <TriangleAlert className="h-12 w-12 text-amber-500" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-semibold">This order cannot be packed</h1>
          <p className="mt-2 text-ink-300">{loadError}</p>
          <Link href="/app/pack" className="mt-6 rounded-full bg-white px-6 py-3 font-medium text-ink-950">
            Back to the queue
          </Link>
        </div>
      </Frame>
    );
  }

  if (!state) {
    return (
      <Frame>
        <div className="flex flex-1 items-center justify-center text-ink-300">
          <LoaderCircle className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> Opening {orderNumber}…
        </div>
      </Frame>
    );
  }

  // --- Finished ---------------------------------------------------------------

  if (step === "done") {
    const verified = state.items.reduce((sum, item) => sum + Math.min(item.verified, item.quantity), 0);
    const ordered = state.items.reduce((sum, item) => sum + item.quantity, 0);
    const handedOver = state.fulfilmentStatus !== "packed" && state.fulfilmentStatus !== "packing";
    const overrides = state.exceptions.filter((entry) => entry.overridden).length;

    return (
      <Frame>
        <div className="flex flex-1 flex-col px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-seal-600">
              <PackageCheck className="h-10 w-10" aria-hidden="true" />
            </span>
            <h1 className="mt-5 text-3xl font-semibold">
              <span className="font-mono">{state.orderNumber}</span> is packed
            </h1>
            <p className="mt-2 text-ink-300">
              {verified} of {ordered} unit{ordered === 1 ? "" : "s"} verified
              {state.durationMs !== null ? ` in ${formatDuration(state.durationMs)}` : ""}.
              {overrides > 0 ? ` ${overrides} override${overrides === 1 ? "" : "s"} recorded.` : ""}
            </p>

            <div className="mt-6 grid w-full max-w-sm grid-cols-2 gap-3">
              {[
                { photo: state.contentsPhoto, caption: "Contents" },
                { photo: state.labelPhoto, caption: "Labelled parcel" },
              ].map(({ photo, caption }) =>
                photo ? (
                  <figure key={caption} className="overflow-hidden rounded-xl bg-ink-900">
                    {/* Served by an authenticated route, not the image optimiser. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/evidence/files/${photo.fileId}`} alt={caption} className="aspect-[4/3] w-full object-cover" />
                    <figcaption className="px-2 py-1.5 text-left">
                      <span className="block text-xs text-ink-200">{caption}</span>
                      <span className="block font-mono text-[10px] text-ink-400">sha256 {photo.sha256.slice(0, 12)}</span>
                    </figcaption>
                  </figure>
                ) : null,
              )}
            </div>

            <p className="mt-6 max-w-sm text-sm text-ink-300">
              {handedOver ? (
                <span className="inline-flex items-center gap-2 text-seal-200">
                  <Truck className="h-4 w-4" aria-hidden="true" /> Handed to {state.carrier ?? "the carrier"}.
                </span>
              ) : (
                "Packed is not the same as dispatched. Record the handover when the courier collects it."
              )}
            </p>
            {error ? <p className="mt-3 text-sm text-signal-200">{error}</p> : null}
          </div>

          <div className="mx-auto w-full max-w-sm space-y-3">
            {!handedOver ? (
              <button
                type="button"
                onClick={handover}
                disabled={busy !== null}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-full border border-white/25 text-base font-medium disabled:opacity-50"
              >
                <Truck className="h-5 w-5" aria-hidden="true" />
                {busy === "handover" ? "Recording…" : "Record handover to the courier"}
              </button>
            ) : null}
            <Link
              href="/app/pack"
              className="flex h-14 w-full items-center justify-center rounded-full bg-white text-base font-semibold text-ink-950"
            >
              Next order
            </Link>
          </div>
        </div>
      </Frame>
    );
  }

  // --- Packing ----------------------------------------------------------------

  const instruction = INSTRUCTIONS[step];
  const photoStep = step === "contents_photo" || step === "label_photo";
  const remaining = state.items.filter((item) => item.verified < item.quantity);

  return (
    <Frame>
      <header className="flex items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <Link
          href="/app/pack"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10"
          aria-label="Back to the queue"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-lg leading-tight font-semibold">{state.orderNumber}</p>
          <p className="truncate text-xs text-ink-300">
            {state.customerName ?? "Customer"} · {state.stationLabel}
          </p>
        </div>
        <Elapsed since={state.startedAt} until={state.completedAt} />
      </header>

      <StepBar step={step} />

      <div className="relative mx-4 mt-3 aspect-[4/3] max-h-[42dvh] overflow-hidden rounded-2xl bg-black">
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
                <p className="text-sm text-ink-200">{cameraProblem(cameraStatus)}</p>
                <p className="text-xs text-ink-400">
                  {photoStep ? "You can upload a photo from the phone's camera app below." : "You can type codes by hand below."}
                </p>
                <button type="button" onClick={() => void startCamera()} className="rounded-full bg-white px-4 py-2 text-sm font-medium text-ink-950">
                  Try the camera again
                </button>
              </>
            )}
          </div>
        ) : null}

        {scanning && cameraStatus === "ready" ? (
          <>
            <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-white/70" aria-hidden="true" />
            <p className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs">
              <span className={cn("h-2 w-2 rounded-full", scanner.ready ? "animate-pulse bg-seal-500" : "bg-amber-500")} />
              {scanner.failed ? "Scanner unavailable: type codes" : scanner.ready ? "Scanning" : "Loading scanner"}
            </p>
          </>
        ) : null}

        {flash ? (
          <div
            key={flash.id}
            className="pointer-events-none absolute inset-x-3 bottom-3 animate-[toast_1.9s_ease-out_forwards] rounded-xl bg-seal-600 px-4 py-3 shadow-raised"
            role="status"
          >
            <p className="flex items-center gap-2 text-base font-semibold">
              <Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" /> {flash.title}
            </p>
            <p className="truncate text-sm text-seal-100">{flash.message}</p>
          </div>
        ) : null}
      </div>

      <div className="px-4 pt-4">
        <h1 className="text-xl font-semibold">{instruction.title}</h1>
        <p className="text-sm text-ink-300">{instruction.hint}</p>
        {error ? (
          <p className="mt-2 rounded-lg bg-signal-600/20 px-3 py-2 text-sm text-signal-100" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {step === "label" ? (
          <div className="flex items-center gap-3 rounded-xl bg-ink-900 px-4 py-3">
            <Tag className="h-5 w-5 shrink-0 text-ink-300" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs text-ink-400">Expected label</p>
              <p className="font-mono text-base break-all">{state.trackingNumber ?? "No label created"}</p>
              <p className="truncate text-xs text-ink-400">{state.carrier}</p>
            </div>
          </div>
        ) : null}

        {step === "label" && !state.trackingNumber ? (
          <div className="mt-2 rounded-xl bg-amber-500/15 px-4 py-3 text-sm text-amber-100">
            <p>This order has no shipping label to scan yet.</p>
            <button
              type="button"
              onClick={() => setSheet("help")}
              className="mt-2 font-medium text-white underline underline-offset-4"
            >
              Continue without a label scan
            </button>
          </div>
        ) : null}

        {step === "review" ? (
          <ul className="mb-3 space-y-2">
            {state.exceptions
              .filter((entry) => entry.overridden)
              .map((entry, index) => (
                <li key={index} className="rounded-xl bg-amber-500/15 px-4 py-3 text-sm text-amber-100">
                  <span className="font-medium">Override:</span> {entry.note}
                </li>
              ))}
          </ul>
        ) : null}

        <ul className="space-y-2">
          {state.items.map((item) => {
            const done = item.verified >= item.quantity;
            return (
              <li
                key={item.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
                  done ? "bg-seal-600/20" : "bg-ink-900",
                )}
              >
                <ProductArt art={item.art} size="thumb" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium">{item.name}</p>
                  <p className="font-mono text-xs text-ink-400">{item.barcode}</p>
                </div>
                <span
                  className={cn(
                    "flex h-9 min-w-[3.5rem] items-center justify-center gap-1 rounded-full px-3 text-sm font-semibold tabular-nums",
                    done ? "bg-seal-600 text-white" : "bg-ink-700 text-ink-100",
                  )}
                >
                  {done ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" /> : null}
                  {item.verified}/{item.quantity}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <footer className="space-y-2 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {photoStep ? (
          <>
            <button
              type="button"
              onClick={() => void savePhoto(photoKind)}
              disabled={busy !== null || cameraStatus !== "ready"}
              className="flex h-16 w-full items-center justify-center gap-2 rounded-full bg-white text-lg font-semibold text-ink-950 disabled:opacity-50"
            >
              {busy === "photo" ? (
                <>
                  <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> Saving…
                </>
              ) : (
                <>
                  <Camera className="h-6 w-6" aria-hidden="true" /> Take photo
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy !== null}
              className="flex h-12 w-full items-center justify-center rounded-full border border-white/25 text-sm font-medium disabled:opacity-50"
            >
              {cameraStatus === "ready" ? "Or upload a photo instead" : "Use the phone’s camera app instead"}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFileChosen} />
          </>
        ) : null}

        {step === "review" ? (
          <button
            type="button"
            onClick={() => void complete()}
            disabled={busy !== null}
            className="flex h-16 w-full items-center justify-center gap-2 rounded-full bg-seal-600 text-lg font-semibold disabled:opacity-50"
          >
            <PackageCheck className="h-6 w-6" aria-hidden="true" />
            {busy === "complete" ? "Finishing…" : "Finish packing"}
          </button>
        ) : null}

        <div className="flex gap-2">
          {step === "items" || step === "label" ? (
            <button
              type="button"
              onClick={() => setSheet("type")}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-white/10 text-sm font-medium"
            >
              <Keyboard className="h-4 w-4" aria-hidden="true" /> Type a code
            </button>
          ) : null}
          {step !== "review" ? (
            <button
              type="button"
              onClick={() => setSheet("help")}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-white/10 text-sm font-medium"
            >
              <CircleHelp className="h-4 w-4" aria-hidden="true" /> Something is wrong
            </button>
          ) : null}
        </div>
      </footer>

      {warning ? (
        <div
          className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-signal-700 px-6 text-center"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="pack-warning-title"
        >
          <TriangleAlert className="h-16 w-16" aria-hidden="true" />
          <h2 id="pack-warning-title" className="mt-4 text-4xl font-semibold">
            {warning.title}
          </h2>
          <p className="mt-3 max-w-sm text-lg text-signal-100">{warning.message}</p>
          <button
            type="button"
            autoFocus
            onClick={() => setWarning(null)}
            className="mt-8 h-14 rounded-full bg-white px-8 text-lg font-semibold text-signal-800"
          >
            OK, keep scanning
          </button>
        </div>
      ) : null}

      {sheet === "type" ? (
        <TypeCodeSheet
          onClose={() => setSheet(null)}
          onSubmit={(code) => {
            setSheet(null);
            void handleCode(code, "manual");
          }}
        />
      ) : null}

      {sheet === "help" ? (
        <HelpSheet
          step={step}
          remaining={remaining}
          busy={busy === "override"}
          onClose={() => setSheet(null)}
          onSubmit={submitOverride}
        />
      ) : null}
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-ink-950 text-white">{children}</div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close" tabIndex={-1} />
      <div className="relative w-full max-w-lg rounded-t-3xl bg-ink-900 px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-full bg-white/10 px-3 py-1.5 text-sm">
            Cancel
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function TypeCodeSheet({ onClose, onSubmit }: { onClose: () => void; onSubmit: (code: string) => void }) {
  const [code, setCode] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (code.trim()) onSubmit(code.trim());
  };
  return (
    <Sheet title="Type a code" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label htmlFor="typed-code" className="block text-sm text-ink-300">
          The number under the barcode, or the tracking number on the label.
        </label>
        <input
          id="typed-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="h-14 w-full rounded-xl border border-white/20 bg-ink-950 px-4 font-mono text-lg text-white placeholder:text-ink-500 focus:border-white focus:outline-none"
          placeholder="2000000001036"
        />
        <button
          type="submit"
          disabled={!code.trim()}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-white text-base font-semibold text-ink-950 disabled:opacity-50"
        >
          <ScanBarcode className="h-5 w-5" aria-hidden="true" /> Check this code
        </button>
      </form>
    </Sheet>
  );
}

function HelpSheet({
  step,
  remaining,
  busy,
  onClose,
  onSubmit,
}: {
  step: PackingStep;
  remaining: PackingState["items"];
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: OverrideInput) => void;
}) {
  type Choice = { key: string; label: string; build: (reason: string) => OverrideInput };

  const choices: Choice[] =
    step === "items"
      ? [
          ...remaining.map((item) => ({
            key: `manual:${item.id}`,
            label: `Confirm one ${item.name} by hand`,
            build: (reason: string): OverrideInput => ({ kind: "manual_item", orderItemId: item.id, reason }),
          })),
          {
            key: "short",
            label: "Send the parcel without the missing items",
            build: (reason: string): OverrideInput => ({ kind: "short_pack", reason }),
          },
        ]
      : [
          {
            key: `skip:${step}`,
            label:
              step === "label" ? "Continue without scanning the label" : "Continue without this photo",
            build: (reason: string): OverrideInput => ({
              kind: "skip_step",
              step: step as "contents_photo" | "label" | "label_photo",
              reason,
            }),
          },
        ];

  const [choice, setChoice] = useState(choices[0]?.key ?? "");
  const [reason, setReason] = useState("");
  const selected = choices.find((item) => item.key === choice) ?? choices[0];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (selected && reason.trim().length >= 3) onSubmit(selected.build(reason.trim()));
  };

  return (
    <Sheet title="Something is wrong" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-ink-300">
          An override lets you carry on. It is recorded on the order with your name and the reason.
        </p>
        <fieldset className="space-y-2">
          <legend className="sr-only">What do you want to do?</legend>
          {choices.map((item) => (
            <label
              key={item.key}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-[15px]",
                choice === item.key ? "border-white bg-white/10" : "border-white/15",
              )}
            >
              <input
                type="radio"
                name="override-choice"
                value={item.key}
                checked={choice === item.key}
                onChange={() => setChoice(item.key)}
                className="h-4 w-4 accent-white"
              />
              {item.label}
            </label>
          ))}
        </fieldset>
        <div>
          <label htmlFor="override-reason" className="block text-sm text-ink-300">
            Reason
          </label>
          <input
            id="override-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={300}
            className="mt-1 h-12 w-full rounded-xl border border-white/20 bg-ink-950 px-4 text-base text-white placeholder:text-ink-500 focus:border-white focus:outline-none"
            placeholder="What happened?"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {QUICK_REASONS.map((quick) => (
              <button
                key={quick}
                type="button"
                onClick={() => setReason(quick)}
                className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-ink-100"
              >
                {quick}
              </button>
            ))}
          </div>
        </div>
        <button
          type="submit"
          disabled={busy || reason.trim().length < 3}
          className="flex h-14 w-full items-center justify-center rounded-full bg-amber-500 text-base font-semibold text-ink-950 disabled:opacity-50"
        >
          {busy ? "Recording…" : "Record override and continue"}
        </button>
      </form>
    </Sheet>
  );
}
