"use client";

import { ShieldCheck, ShieldX } from "lucide-react";
import { useState, useTransition } from "react";

import { verifyLedgerAction } from "@/app/(merchant)/app/(console)/orders/actions";
import { Button } from "@/components/ui/button";
import type { LedgerVerification } from "@/lib/ledger/verify";
import { formatDateTime } from "@/lib/utils";

/**
 * Recomputes the order's hash chain and re-hashes every stored file on the
 * server, then shows the result. Wording is deliberate: tamper-evident.
 */
export function VerifyLedger({ orderId, headHash }: { orderId: string; headHash: string | null }) {
  const [pending, startTransition] = useTransition();
  const [report, setReport] = useState<LedgerVerification | null>(null);
  const [error, setError] = useState<string | null>(null);

  const verify = () => {
    setError(null);
    startTransition(async () => {
      const result = await verifyLedgerAction(orderId);
      if ("error" in result) {
        setError(result.error);
        setReport(null);
      } else {
        setReport(result);
      }
    });
  };

  return (
    <div className="border-t border-line px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 text-sm">
          <p className="font-medium text-ink-950">Tamper-evident record</p>
          <p className="text-ink-500">
            Each entry is hashed together with the one before it.
            {headHash ? (
              <>
                {" "}
                Chain head{" "}
                <span className="font-mono text-[12px] text-ink-700" title={headHash}>
                  {headHash.slice(0, 16)}…
                </span>
              </>
            ) : null}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={verify} disabled={pending}>
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {pending ? "Checking…" : "Verify integrity"}
        </Button>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg bg-signal-50 px-3 py-2 text-sm text-signal-800" role="alert">
          {error}
        </p>
      ) : null}

      {report ? (
        report.ok ? (
          <div className="mt-3 flex items-start gap-2.5 rounded-lg bg-seal-50 px-3 py-2.5 text-sm text-seal-800" role="status">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              <span className="font-medium">No changes detected.</span> {report.eventCount} entr
              {report.eventCount === 1 ? "y" : "ies"} and {report.fileCount} file
              {report.fileCount === 1 ? "" : "s"} match the hashes recorded when they were captured.
              Checked {formatDateTime(report.checkedAt, true)}.
            </p>
          </div>
        ) : (
          <div className="mt-3 rounded-lg bg-signal-50 px-3 py-2.5 text-sm text-signal-800" role="alert">
            <p className="flex items-center gap-2 font-medium">
              <ShieldX className="h-4 w-4" aria-hidden="true" /> This record has changed since it was captured.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {report.problems.map((problem, index) => (
                <li key={index}>
                  {problem.seq !== null ? <span className="font-mono text-[12px]">E{problem.seq}: </span> : null}
                  {problem.detail}
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}
    </div>
  );
}
