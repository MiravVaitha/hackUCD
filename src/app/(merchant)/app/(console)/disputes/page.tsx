import Link from "next/link";
import { PageHeader } from "@/components/console/page-header";
import { CONSOLE_ROLES, requireUser } from "@/lib/auth/guards";
import { listDisputes, isSimulatedDispute } from "@/lib/disputes/service";
import { formatMoney, formatDateTime, sentenceCase } from "@/lib/utils";

export const metadata = { title: "Disputes & evidence" };
export default async function DisputesPage() {
  const session = await requireUser(CONSOLE_ROLES);
  const rows = await listDisputes(session.merchant.id);
  return <><PageHeader title="Disputes & evidence" description="Bring the record together. Prepare a factual response for review." />
    <div className="divide-y divide-line rounded-xl border border-line bg-white">{rows.length ? rows.map(({ dispute: d, orderNumber }) => <Link key={d.id} href={`/app/disputes/${d.id}`} className="block p-5 hover:bg-paper"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">{orderNumber} · {sentenceCase(d.reason)}</h2><span className="font-mono">{formatMoney(d.amountMinor, d.currency)}</span></div><p className="mt-2 text-sm text-ink-500">{isSimulatedDispute(d) ? "Simulated bank event" : d.livemode ? "Stripe" : "Stripe sandbox"} · {sentenceCase(d.outcome ?? d.stripeStatus)} · Evidence due {formatDateTime(d.evidenceDueBy)}</p></Link>) : <div className="p-8"><h2 className="font-semibold">No disputes yet</h2><p className="mt-2 text-sm text-ink-500">Use “Sync demo APIs” on the dashboard to import an example dispute and its supporting records.</p></div>}</div>
  </>;
}
