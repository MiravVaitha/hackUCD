import { readJson, requireStationUser, stationError } from "@/lib/packing/http";
import { PackingError, recordOverride, type OverrideInput } from "@/lib/packing/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireStationUser();
  if (session instanceof Response) return session;

  const { id } = await context.params;
  const body = await readJson<Partial<OverrideInput> & { reason?: string }>(request);
  try {
    if (!body || typeof body.reason !== "string") throw new PackingError("Give a short reason for the override.");

    let input: OverrideInput;
    if (body.kind === "manual_item" && typeof body.orderItemId === "string") {
      input = { kind: "manual_item", orderItemId: body.orderItemId, reason: body.reason };
    } else if (body.kind === "short_pack") {
      input = { kind: "short_pack", reason: body.reason };
    } else if (
      body.kind === "skip_step" &&
      (body.step === "contents_photo" || body.step === "label" || body.step === "label_photo")
    ) {
      input = { kind: "skip_step", step: body.step, reason: body.reason };
    } else {
      throw new PackingError("Unknown override.");
    }

    return Response.json({ state: await recordOverride(session, id, input) });
  } catch (error) {
    return stationError(error);
  }
}
