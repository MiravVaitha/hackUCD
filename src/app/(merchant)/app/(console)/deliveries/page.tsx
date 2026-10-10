import { CONSOLE_ROLES, requireUser } from "@/lib/auth/guards";
import { PageHeader } from "@/components/console/page-header";
import { DeliveryEmailForm } from "@/components/console/delivery-email-form";
import { hasSubscription } from "@/lib/subscription";
export const metadata = { title: "Delivery emails" };
export const maxDuration = 180;
export default async function DeliveryEmails() {
  const session = await requireUser(CONSOLE_ROLES);
  return <><PageHeader title="Delivery emails" description="Paste a courier email, extract its delivery details, and review before adding it to an order." /><DeliveryEmailForm premium={hasSubscription(session.merchant)} /></>;
}
