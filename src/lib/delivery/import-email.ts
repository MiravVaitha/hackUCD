import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
import type { SessionContext } from "@/lib/auth/session";
import { appendLedgerEvent } from "@/lib/ledger/append";
import { InputError } from "@/lib/forms";

export const deliveryEmailSchema = z.object({
  raw: z.string().trim().min(20).max(20000), orderNumber: z.string().trim().min(1).max(40),
  carrier: z.string().trim().max(80), tracking: z.string().trim().max(100), reportedDate: z.string().trim().max(100),
  status: z.enum(["unknown", "exception", "out_for_delivery", "delivered", "in_transit"]),
  parser: z.enum(["local-rules-v1", "openrouter-reviewed-v1"]).default("local-rules-v1"),
});
export async function importDeliveryEmail(context: SessionContext, input: unknown) {
  const parsed = deliveryEmailSchema.safeParse(input);
  if (!parsed.success) throw new InputError("Check the email and delivery fields before saving.");
  const data = parsed.data;
  const [order] = await db.select().from(orders).where(and(eq(orders.merchantId, context.merchant.id), eq(orders.number, data.orderNumber.toUpperCase()))).limit(1);
  if (!order) throw new InputError("That order is not in your workspace. Check its order number.");
  const digest = createHash("sha256").update(JSON.stringify(data)).digest("hex");
  await appendLedgerEvent({ merchantId: context.merchant.id, orderId: order.id, type: "delivery.email_imported", source: "merchant_pasted_email", actor: { type: "user", id: context.user.id, label: context.user.name }, summary: `Unverified delivery email: ${data.carrier || "unknown carrier"}; reported status ${data.status.replaceAll("_", " ")}; tracking ${data.tracking || "not supplied"}${data.reportedDate ? `; reported date ${data.reportedDate}` : ""}. Reviewed by merchant; not carrier-verified.`, payload: { ...data, verification: "merchant-reviewed, sender and delivery not authenticated" }, simulated: order.simulated, dedupeKey: `delivery-email:${digest}` });
  return order;
}
