"use client";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncDemoAction } from "@/app/(merchant)/app/(console)/actions";
export function SyncDemo() {
  const [busy, start] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  return <div className="max-w-md"><Button variant="danger" disabled={busy} onClick={() => start(async () => { setMessage(""); try { const result = await syncDemoAction(); setError(Boolean(result.error)); setMessage(result.error ?? result.success ?? "Synced."); } catch { setError(true); setMessage("Sync failed. Please try again."); } })}><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />{busy ? "Pulling simulated API records…" : "Sync demo APIs"}</Button>{message && <p role={error ? "alert" : "status"} className={`mt-2 text-xs ${error ? "text-signal-700" : "text-ink-500"}`}>{message}</p>}</div>;
}
