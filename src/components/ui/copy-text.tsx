"use client";
import { useState } from "react";
import { Button } from "./button";
export function CopyText({ text }: { text: string }) {
  const [message, setMessage] = useState("");
  return <div className="space-y-2"><Button variant="secondary" onClick={async () => { try { await navigator.clipboard.writeText(text); setMessage("Copied to clipboard."); } catch { setMessage("Select the text below and copy it manually."); } }}>Copy email text</Button><p role="status" className="text-xs text-ink-500">{message}</p><textarea aria-label="Email-ready response" readOnly value={text} rows={12} className="w-full rounded-lg border border-line bg-paper p-4 text-sm leading-relaxed" /></div>;
}
