import { TriangleAlert } from "lucide-react";

import { missingEnv } from "@/lib/env";

/**
 * Shown while required configuration is missing. Lists variable names and what
 * each is for. Never shows values.
 */
export function SetupNotice({ className }: { className?: string }) {
  const missing = missingEnv();
  if (missing.length === 0) return null;

  return (
    <div
      className={
        "rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 " + (className ?? "")
      }
      role="status"
    >
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-medium">Setup is not finished</p>
          <p className="mt-1">
            These environment variables are not set on this deployment, so the related features are
            unavailable:
          </p>
          <ul className="mt-2 space-y-1">
            {missing.map((item) => (
              <li key={item.name}>
                <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[13px]">
                  {item.name}
                </code>{" "}
                <span className="text-amber-700">for {item.neededFor}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
