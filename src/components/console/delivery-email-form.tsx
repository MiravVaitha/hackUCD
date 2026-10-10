"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { parseDeliveryEmail } from "@/lib/delivery/parse-email";
import { saveDeliveryEmail, extractEmailWithAi } from "@/app/(merchant)/app/(console)/deliveries/actions";

export function DeliveryEmailForm({ premium }: { premium: boolean }) {
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState<ReturnType<typeof parseDeliveryEmail> | null>(null);
  const [version, setVersion] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [aiInfo, setAiInfo] = useState<{ model: string; quote: string } | null>(null);
  const extractAi = () => startTransition(async () => {
    setError(""); setPreview(null); setAiInfo(null);
    try {
      const response = await extractEmailWithAi(raw);
      if (response.error) { setError(response.error); return; }
      if (response.result) {
        setPreview(response.result.extraction);
        setAiInfo({ model: response.result.model, quote: response.result.extraction.statusQuote });
        setVersion(value => value + 1);
      }
    } catch { setError("Email extraction could not complete. Try again."); }
  });
  return <div className="max-w-3xl space-y-6">
    <section className="space-y-4 rounded-xl border border-line bg-white p-6">
      <h2 className="text-lg font-semibold">1. Paste a delivery email</h2>
      <p className="text-sm text-ink-500">Use free local parsing or Premium AI extraction. Choosing OpenRouter sends this email text to the AI provider for analysis. No mailbox is connected and no email is sent.</p>
      <Field label="Email text" htmlFor="email-text"><Textarea id="email-text" rows={9} maxLength={20000} disabled={pending} value={raw} onChange={event => { setRaw(event.target.value); setPreview(null); setAiInfo(null); setError(""); }} placeholder={"From: DHL\nOrder: VB-1001\nTracking number: 1234567890\nStatus: Delivered\nDelivery date: 2026-10-09"} /></Field>
      <div className="flex flex-wrap items-center gap-3"><button type="button" className="rounded-lg border border-line px-4 py-3 text-sm font-semibold disabled:opacity-50" disabled={pending || raw.trim().length < 20} onClick={() => { setPreview(parseDeliveryEmail(raw)); setVersion(version + 1); setAiInfo(null); setError(""); }}>Extract locally · Free</button>
      {premium ? <button type="button" disabled={pending || raw.trim().length < 20} onClick={extractAi} className="rounded-lg bg-signal-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Reading email with OpenRouter…" : "Extract with OpenRouter · Premium"}</button> : <Link href="/account" className="text-sm font-semibold underline">Upgrade for AI email parsing</Link>}</div>
      {error && <p role="alert" className="text-sm text-signal-700">{error}</p>}
    </section>
    {preview && <section className="space-y-4 rounded-xl border border-line bg-white p-6">
      <h2 className="text-lg font-semibold">2. Review and attach to an order</h2>
      {aiInfo && <p role="status" className="rounded-lg bg-paper p-3 text-sm">Extracted with {aiInfo.model}.{aiInfo.quote && <> Status source: “{aiInfo.quote}”</>}</p>}
      <p className="text-sm text-ink-500">Check every field. Missing details stay blank. Dates retain the email’s wording. Saving adds an unverified email record to the evidence timeline; it does not change the carrier’s verified shipment status.</p>
      <ActionForm key={version} action={saveDeliveryEmail} submit="Save reviewed delivery email" pending="Saving evidence…">
        <input type="hidden" name="raw" value={raw} />
        <input type="hidden" name="parser" value={aiInfo ? "openrouter-reviewed-v1" : "local-rules-v1"} />
        <Field label="Order number" htmlFor="orderNumber"><Input id="orderNumber" name="orderNumber" required maxLength={40} defaultValue={preview.orderNumber} placeholder="VB-1001" /></Field>
        <Field label="Courier" htmlFor="carrier"><Input id="carrier" name="carrier" maxLength={80} defaultValue={preview.carrier} /></Field>
        <Field label="Tracking number" htmlFor="tracking"><Input id="tracking" name="tracking" maxLength={100} defaultValue={preview.tracking} /></Field>
        <Field label="Reported status" htmlFor="status"><Select id="status" name="status" defaultValue={preview.status}><option value="unknown">Unknown</option><option value="in_transit">In transit</option><option value="out_for_delivery">Out for delivery</option><option value="delivered">Delivered</option><option value="exception">Exception / delayed / failed</option></Select></Field>
        <Field label="Date reported in email" htmlFor="reportedDate"><Input id="reportedDate" name="reportedDate" maxLength={100} defaultValue={preview.reportedDate} /></Field>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="reviewed" required className="mt-1" />I checked the order and extracted details. This email has not been independently authenticated.</label>
      </ActionForm>
    </section>}
  </div>;
}
