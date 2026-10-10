"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export type CameraStatus = "idle" | "starting" | "ready" | "denied" | "insecure" | "busy" | "unavailable";

/** What to tell the packer when the camera cannot start, and what to do instead. */
export function cameraProblem(status: CameraStatus): string | null {
  switch (status) {
    case "denied":
      return "Camera access is blocked for this site. Allow the camera in your browser's site settings, then try again.";
    case "insecure":
      return "The camera only works over a secure https:// link. Open the station from the https address, not a local http:// one.";
    case "busy":
      return "Another app is using the camera. Close it (or other camera tabs), then try again.";
    case "unavailable":
      return "No camera was found on this device.";
    default:
      return null;
  }
}

export type CapturedPhoto = { blob: Blob; width: number; height: number };

const MAX_EDGE = 1600;
const TARGET_BYTES = 700_000;

/** Draw a frame or image onto a canvas no larger than MAX_EDGE and encode it as JPEG. */
async function encodeJpeg(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): Promise<CapturedPhoto> {
  const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot capture photos.");
  context.drawImage(source, 0, 0, width, height);

  const toBlob = (quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

  // Step the quality down until the photo is comfortably small to upload.
  for (const quality of [0.82, 0.7, 0.55]) {
    const blob = await toBlob(quality);
    if (blob && (blob.size <= TARGET_BYTES || quality === 0.55)) return { blob, width, height };
  }
  throw new Error("The photo could not be captured.");
}

/** Downscale a photo chosen from the phone's own camera app. */
export async function photoFromFile(file: File): Promise<CapturedPhoto> {
  if (typeof createImageBitmap === "function") {
    try {
      // Respect the EXIF rotation so portrait phone photos are not stored sideways.
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      try {
        return await encodeJpeg(bitmap, bitmap.width, bitmap.height);
      } finally {
        bitmap.close();
      }
    } catch {
      // Older Safari: fall back to an <img>, which also applies EXIF rotation.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return await encodeJpeg(image, image.naturalWidth, image.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Rear camera stream attached to a <video>. The stream stays open for as long
 * as the component is mounted, so iOS asks for permission once per visit.
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");

  /** Show the stream in the video element, whichever of the two arrived first. */
  const connect = useCallback(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream || video.srcObject === stream) return;
    video.srcObject = stream;
    // Required for inline playback on iOS Safari.
    video.setAttribute("playsinline", "true");
    video.muted = true;
    void video.play().catch(() => {});
  }, []);

  /** Ref callback for the <video>. The element can mount before or after the stream starts. */
  const attachVideo = useCallback(
    (video: HTMLVideoElement | null) => {
      videoRef.current = video;
      connect();
    },
    [connect],
  );

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current) return;
    if (typeof window !== "undefined" && !window.isSecureContext) {
      // Phones hide the camera API entirely on plain http:// pages.
      setStatus("insecure");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unavailable");
      return;
    }
    setStatus("starting");
    const open = (video: MediaTrackConstraints | true) =>
      navigator.mediaDevices.getUserMedia({ audio: false, video });
    try {
      let stream: MediaStream;
      try {
        stream = await open({
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        });
      } catch (error) {
        // Some cameras reject the preferred size; any camera is better than none.
        if (error instanceof DOMException && error.name === "OverconstrainedError") stream = await open(true);
        else throw error;
      }
      streamRef.current = stream;
      connect();
      setStatus("ready");
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setStatus(
        name === "NotAllowedError" || name === "SecurityError"
          ? "denied"
          : name === "NotReadableError" || name === "AbortError"
            ? "busy"
            : "unavailable",
      );
    }
  }, [connect]);

  useEffect(() => stop, [stop]);

  const capture = useCallback(async (): Promise<CapturedPhoto> => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) {
      throw new Error("The camera is not ready yet.");
    }
    return encodeJpeg(video, video.videoWidth, video.videoHeight);
  }, []);

  return { videoRef, attachVideo, status, start, stop, capture };
}

type DetectedBarcode = { rawValue: string };
type Detector = { detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]> };

/** How long a code must be out of view before the same code counts as a new scan. */
const RESCAN_AFTER_MS = 1400;
const SCAN_INTERVAL_MS = 130;
const SCAN_WIDTH = 1280;

/**
 * Continuously read barcodes from the camera. A code is reported once when it
 * comes into view, and again only after it has left and come back, which is
 * how two identical items are scanned one after the other.
 */
export function useBarcodeScanner(options: {
  videoRef: RefObject<HTMLVideoElement | null>;
  active: boolean;
  onCode: (code: string) => void;
}) {
  const { videoRef, active } = options;
  const onCodeRef = useRef(options.onCode);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onCodeRef.current = options.onCode;
  }, [options.onCode]);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const lastSeen = new Map<string, number>();
    const canvas = document.createElement("canvas");

    const run = async () => {
      let detector: Detector;
      try {
        const library = await import("barcode-detector/ponyfill");
        // Load the reader from this site rather than a third-party CDN.
        library.prepareZXingModule({
          overrides: {
            locateFile: (path: string, prefix: string) =>
              path.endsWith(".wasm") ? "/vendor/zxing_reader.wasm" : prefix + path,
          },
        });
        detector = new library.BarcodeDetector({
          formats: ["ean_13", "ean_8", "upc_a", "code_128", "qr_code"],
        }) as unknown as Detector;
      } catch {
        if (!stopped) setFailed(true);
        return;
      }
      if (stopped) return;
      setReady(true);

      const tick = async () => {
        if (stopped) return;
        const video = videoRef.current;
        if (video && video.readyState >= 2 && video.videoWidth > 0) {
          try {
            const scale = Math.min(1, SCAN_WIDTH / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            const context = canvas.getContext("2d", { willReadFrequently: true });
            if (context) {
              context.drawImage(video, 0, 0, canvas.width, canvas.height);
              const found = await detector.detect(canvas);
              const now = performance.now();
              for (const barcode of found) {
                const value = barcode.rawValue?.trim();
                if (!value) continue;
                const previous = lastSeen.get(value);
                lastSeen.set(value, now);
                if (previous === undefined || now - previous > RESCAN_AFTER_MS) {
                  onCodeRef.current(value);
                }
              }
            }
          } catch {
            // A failed frame is not worth reporting; the next one follows shortly.
          }
        }
        if (!stopped) timer = setTimeout(tick, SCAN_INTERVAL_MS);
      };
      void tick();
    };

    void run();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [active, videoRef]);

  return { ready, failed };
}

/**
 * Handheld barcode scanners type the code like a fast keyboard and press Enter.
 * This picks that up anywhere on the page, without stealing normal typing.
 */
export function useScannerKeyboard(onCode: (code: string) => void, enabled: boolean) {
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let lastKeyAt = 0;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      const now = performance.now();
      if (now - lastKeyAt > 90) buffer = "";
      lastKeyAt = now;

      if (event.key === "Enter") {
        if (buffer.length >= 4) onCodeRef.current(buffer);
        buffer = "";
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        buffer += event.key;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

/** Short confirmation and warning tones. Silent until the page has had a tap, as browsers require. */
export function useBeeper() {
  const contextRef = useRef<AudioContext | null>(null);

  return useCallback((kind: "ok" | "error") => {
    try {
      const AudioContextClass =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      contextRef.current ??= new AudioContextClass();
      const context = contextRef.current;
      if (context.state === "suspended") void context.resume();

      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = kind === "ok" ? "sine" : "square";
      oscillator.frequency.value = kind === "ok" ? 880 : 196;
      const duration = kind === "ok" ? 0.09 : 0.32;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + duration + 0.02);
    } catch {
      // Sound is a nicety; the on-screen feedback is what matters.
    }
  }, []);
}

/** Keep the screen awake while packing. */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        // Not granted (for example in low-power mode). Nothing to do.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && !released) void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, [enabled]);
}
