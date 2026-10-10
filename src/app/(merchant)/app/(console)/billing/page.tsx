import { redirect } from "next/navigation";
export default async function BillingRedirect({ searchParams }: { searchParams: Promise<{ session_id?: string; cancelled?: string }> }) {
  const query = await searchParams;
  const params = new URLSearchParams();
  if (query.session_id) params.set("session_id", query.session_id);
  if (query.cancelled) params.set("cancelled", query.cancelled);
  redirect(`/account${params.size ? `?${params}` : ""}`);
}
