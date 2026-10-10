import { asc, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { accessLogs, complaintMessages } from "@/db/schema";
import { CONSOLE_ROLES } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { verifyOrderLedger } from "@/lib/ledger/verify";
import { getCustomerHistory } from "@/lib/orders/history";
import { getOrderRecord } from "@/lib/orders/queries";
import { buildOrderReport } from "@/lib/pdf/order-report";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Download the order's full evidence record as a PDF. */
export async function GET(request: Request, context: { params: Promise<{ number: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Sign in to download this report.", { status: 401 });
  if (!CONSOLE_ROLES.includes(session.user.role)) {
    return new Response("You do not have access to this report.", { status: 403 });
  }

  const { number } = await context.params;
  const record = await getOrderRecord(session.merchant.id, number);
  if (!record) return new Response("Order not found.", { status: 404 });

  const [history, verification, messages] = await Promise.all([
    getCustomerHistory(session.merchant.id, record.order.customerEmail, record.order),
    verifyOrderLedger(record.order.id, session.merchant.id),
    record.complaints.length > 0
      ? db
          .select()
          .from(complaintMessages)
          .where(
            inArray(
              complaintMessages.complaintId,
              record.complaints.map((complaint) => complaint.id),
            ),
          )
          .orderBy(asc(complaintMessages.createdAt))
      : Promise.resolve([]),
  ]);

  const bytes = await buildOrderReport({
    merchant: session.merchant,
    record,
    history,
    messages,
    verification,
    generatedBy: session.user.name,
  });

  await db.insert(accessLogs).values({
    merchantId: session.merchant.id,
    userId: session.user.id,
    action: "download_order_report",
    targetType: "order",
    targetId: record.order.id,
    orderId: record.order.id,
    userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
  });

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `attachment; filename="${record.order.number}-evidence-report.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
