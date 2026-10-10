import type { ScanMethod } from "@/db/schema";
import { readJson, requireStationUser, stationError } from "@/lib/packing/http";
import { PackingError, recordScan } from "@/lib/packing/service";

export const dynamic = "force-dynamic";

const METHODS: ScanMethod[] = ["camera", "scanner", "manual"];

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireStationUser();
  if (session instanceof Response) return session;

  const { id } = await context.params;
  const body = await readJson<{ code?: string; method?: ScanMethod }>(request);
  try {
    if (!body?.code) throw new PackingError("No code was scanned.");
    const method = METHODS.includes(body.method as ScanMethod) ? (body.method as ScanMethod) : "manual";
    return Response.json(await recordScan(session, id, body.code, method));
  } catch (error) {
    return stationError(error);
  }
}
