import { requireUser } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

/** The packing station: a full-screen layout open to every signed-in role. */
export default async function StationLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <div className="min-h-dvh bg-ink-950 text-white">{children}</div>;
}
