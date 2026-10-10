"use client";

import { useActionState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./button";

export type FormResult = { error?: string; success?: string; href?: string };
export type FormAction = (previous: FormResult, data: FormData) => Promise<FormResult>;

/** Every mutation has a pending state and a readable, non-destructive failure. */
export function ActionForm({ action, children, submit, pending = "Saving…", variant = "primary" }: {
  action: FormAction; children?: ReactNode; submit: string; pending?: string;
  variant?: "primary" | "secondary" | "danger" | "seal";
}) {
  const [state, formAction, busy] = useActionState(action, {});
  const router = useRouter();
  useEffect(() => { if (state.href) router.push(state.href); }, [state.href, router]);
  return <form action={formAction} className="space-y-4">
    <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">{children}</fieldset>
    {state.error && <p role="alert" className="rounded-lg bg-signal-50 p-3 text-sm text-signal-700">{state.error}</p>}
    {state.success && <p role="status" className="rounded-lg bg-seal-50 p-3 text-sm text-seal-800">{state.success}</p>}
    <Button type="submit" disabled={busy} variant={variant}>{busy ? pending : submit}</Button>
  </form>;
}
