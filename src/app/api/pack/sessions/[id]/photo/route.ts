import { requireStationUser, stationError } from "@/lib/packing/http";
import { attachPackingPhoto, PackingError } from "@/lib/packing/service";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BYTES = 4 * 1024 * 1024;

function positiveInt(value: string | null): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number < 20_000 ? number : null;
}

/**
 * Upload a packing photo. The image is sent as the raw request body, already
 * downscaled on the device. Its hash is computed here from the stored bytes.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireStationUser();
  if (session instanceof Response) return session;

  const { id } = await context.params;
  const url = new URL(request.url);
  try {
    const kind = url.searchParams.get("kind");
    if (kind !== "contents" && kind !== "label") throw new PackingError("Unknown photo type.");

    const mime = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) throw new PackingError("That photo is too large. Try again.", 413);

    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.length > MAX_BYTES) throw new PackingError("That photo is too large. Try again.", 413);

    const capturedAtValue = url.searchParams.get("capturedAt");
    const capturedAt = capturedAtValue ? new Date(capturedAtValue) : null;

    const state = await attachPackingPhoto(session, id, {
      kind,
      bytes,
      mime,
      width: positiveInt(url.searchParams.get("w")),
      height: positiveInt(url.searchParams.get("h")),
      capturedAt: capturedAt && !Number.isNaN(capturedAt.getTime()) ? capturedAt : null,
    });
    return Response.json({ state });
  } catch (error) {
    return stationError(error);
  }
}
