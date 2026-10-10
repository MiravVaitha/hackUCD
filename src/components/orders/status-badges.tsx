import { Badge } from "@/components/ui/badge";
import type { FulfilmentStatus, PaymentStatus } from "@/db/schema";
import { disputeStatusLabel, FULFILMENT_STATUS, PAYMENT_STATUS } from "@/lib/orders/labels";

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const { label, tone } = PAYMENT_STATUS[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={tone}>{label}</Badge>;
}

export function FulfilmentBadge({ status }: { status: FulfilmentStatus }) {
  const { label, tone } = FULFILMENT_STATUS[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={tone}>{label}</Badge>;
}

export function DisputeBadge({ stripeStatus, outcome }: { stripeStatus: string; outcome: string | null }) {
  const { label, tone } = disputeStatusLabel(stripeStatus, outcome);
  return <Badge tone={tone}>{label}</Badge>;
}
