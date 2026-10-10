import type { ComplaintMessage } from "@/db/schema";
import { formatDateTime, cn } from "@/lib/utils";

export function Conversation({ messages }: { messages: ComplaintMessage[] }) {
  return <ol className="space-y-4">{messages.map(message => <li key={message.id} className={cn("rounded-xl border p-4", message.direction === "internal" ? "border-amber-200 bg-amber-50" : message.direction === "outbound" ? "border-seal-200 bg-seal-50" : "border-line bg-white")}>
    <div className="flex flex-wrap justify-between gap-2 text-xs text-ink-500"><span className="font-semibold">{message.authorLabel}{message.direction === "internal" ? " · Internal note" : ""}{message.aiRunId ? " · Reviewed AI draft" : ""}</span><time>{formatDateTime(message.createdAt)}</time></div>
    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{message.body}</p>
  </li>)}</ol>;
}
