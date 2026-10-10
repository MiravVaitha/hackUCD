import { readJson, requireStationUser, stationError } from "@/lib/packing/http";
import { findOrderNumberByCode, PackingError, startPackingSession } from "@/lib/packing/service";

export const dynamic = "force-dynamic";

/** Start packing an order, or resume its open session. Accepts an order number or a scanned slip code. */
export async function POST(request: Request) {
  const session = await requireStationUser();
  if (session instanceof Response) return session;

  const body = await readJson<{ orderNumber?: string; code?: string; station?: string }>(request);
  try {
    let orderNumber = body?.orderNumber?.trim();
    if (!orderNumber && body?.code) {
      orderNumber = (await findOrderNumberByCode(session.merchant.id, body.code)) ?? undefined;
      if (!orderNumber) throw new PackingError("That code is not a packing slip for one of your orders.", 404);
    }
    if (!orderNumber) throw new PackingError("Scan a packing slip or enter an order number.");

    const state = await startPackingSession(session, orderNumber, body?.station);
    return Response.json({ state });
  } catch (error) {
    return stationError(error);
  }
}
