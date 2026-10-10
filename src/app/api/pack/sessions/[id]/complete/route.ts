import { recordHandover } from "@/lib/carriers/demo-carrier";
import { readJson, requireStationUser, stationError } from "@/lib/packing/http";
import { completePacking, getPackingState } from "@/lib/packing/service";

export const dynamic = "force-dynamic";

/**
 * Finish packing. With `{ "handover": true }` it instead records that an
 * already packed parcel was given to the carrier, which is a separate moment.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireStationUser();
  if (session instanceof Response) return session;

  const { id } = await context.params;
  const body = await readJson<{ handover?: boolean }>(request);
  try {
    if (body?.handover) {
      const current = await getPackingState(session, id);
      await recordHandover(session, current.orderId);
      return Response.json({ state: await getPackingState(session, id) });
    }
    return Response.json({ state: await completePacking(session, id) });
  } catch (error) {
    return stationError(error);
  }
}
