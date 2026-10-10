import { ConsoleNav } from "@/components/console/console-nav";
import { LiveRefresh } from "@/components/console/live-refresh";
import { CONSOLE_ROLES, requireUser } from "@/lib/auth/guards";
import { getNavCounts } from "@/lib/console/nav-counts";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser(CONSOLE_ROLES);
  const counts = await getNavCounts(session.merchant.id);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <ConsoleNav user={session.user} merchantName={session.merchant.name} counts={counts} />
      <main className="mx-auto w-full max-w-6xl min-w-0 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      <LiveRefresh />
    </div>
  );
}
