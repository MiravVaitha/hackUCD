import { CarrierError } from "@/lib/carriers/demo-carrier";
import { getSession, type SessionContext } from "@/lib/auth/session";
import { PackingError } from "./service";

/** Sign-in check for the packing station's JSON endpoints. Any role may pack. */
export async function requireStationUser(): Promise<SessionContext | Response> {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in to use the packing station." }, { status: 401 });
  return session;
}

/** Turn a thrown error into a JSON response the station can show to the packer. */
export function stationError(error: unknown): Response {
  if (error instanceof PackingError || error instanceof CarrierError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("[packing station] unexpected error:", error instanceof Error ? error.message : error);
  return Response.json({ error: "Something went wrong. Try that again." }, { status: 500 });
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
