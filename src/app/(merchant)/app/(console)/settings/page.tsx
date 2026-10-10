import Link from "next/link";
import { PageHeader } from "@/components/console/page-header";
import { requireUser } from "@/lib/auth/guards";
import { envChecks, env } from "@/lib/env";
import { SyncDemo } from "@/components/console/sync-demo";
export const metadata = { title: "Workspace settings" };
export default async function Settings() {
  const session = await requireUser(["owner"]);
  return <><PageHeader title="Workspace settings" description={`${session.merchant.name} · Demo configuration`} /><div className="grid gap-6 lg:grid-cols-2"><section className="space-y-4 rounded-xl border border-line bg-white p-6"><h2 className="font-semibold">Service configuration</h2>{envChecks().map(check => <div key={check.name} className="flex justify-between gap-3 border-b border-line pb-3 text-sm"><div><p className="font-mono text-xs">{check.name}</p><p className="mt-1 text-ink-500">{check.neededFor}</p></div><span>{check.present ? "Configured" : "Missing"}</span></div>)}<p className="text-xs text-ink-500">Presence checks only. Credentials stay on the server. AI model: {env.openRouterModel}.</p></section><section className="space-y-5 rounded-xl border border-line bg-white p-6"><h2 className="font-semibold">Demo workspace</h2><p className="text-sm text-ink-500">Import four sample orders, payments, warehouse checks, deliveries, two customer messages and a simulated dispute. Repeating a sync preserves existing records.</p>{env.demoMode && <SyncDemo />}<Link href="/account" className="block text-sm underline">Manage Premium · €2.49/month →</Link><h3 className="font-semibold">Merchant policies</h3><p className="text-sm text-ink-500">{session.merchant.settings.refundPolicy}</p><p className="text-sm text-ink-500">{session.merchant.settings.shippingPolicy}</p></section></div></>;
}
