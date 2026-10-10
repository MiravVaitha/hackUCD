import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Textarea } from "@/components/ui/field";
import { Conversation } from "@/components/complaints/thread";
import { getComplaintThreadByToken } from "@/lib/complaints/service";
import { sentenceCase } from "@/lib/utils";
import { replyToHelpCase } from "../actions";

export const metadata = { title: "Your support case", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export const dynamic = "force-dynamic";
export default async function CustomerCase({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const thread = await getComplaintThreadByToken(token);
  if (!thread) notFound();
  const { complaint } = thread;
  return <main className="mx-auto max-w-2xl space-y-6 px-5 py-12">
    <div><p className="text-sm text-seal-700">CASE {complaint.number} · {sentenceCase(complaint.status)}</p><h1 className="mt-2 font-display text-3xl">{complaint.subject}</h1><p className="mt-3 text-sm text-ink-500">Keep this private link to return for replies. Anyone with the link can view this conversation. Replies appear here; this demo does not send email.</p></div>
    <Conversation messages={thread.messages.filter(message => message.direction !== "internal")} />
    {complaint.resolution && <p className="rounded-xl bg-seal-50 p-4">Resolution: {sentenceCase(complaint.resolution)}</p>}
    {complaint.status !== "escalated" ? <ActionForm action={replyToHelpCase} submit="Send message"><input type="hidden" name="token" value={token} /><Field label="Add a message" htmlFor="message"><Textarea id="message" name="message" required minLength={2} maxLength={5000} /></Field></ActionForm> : <p className="rounded-xl bg-amber-50 p-4">This case is now being handled through the bank dispute process.</p>}
  </main>;
}
