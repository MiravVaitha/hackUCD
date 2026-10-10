import { db } from "@/db/client";
import { accessLogs } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { readEvidenceBytes } from "@/lib/evidence/files";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Serve a stored evidence file to a signed-in member of the merchant that owns
 * it. Every access is written to the access log.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Sign in to view this file.", { status: 401 });

  const { id } = await context.params;
  if (!UUID.test(id)) return new Response("Not found.", { status: 404 });

  const stored = await readEvidenceBytes(id, session.merchant.id);
  if (!stored) return new Response("Not found.", { status: 404 });
  if (session.user.role === "packer" && stored.file.mime === "application/pdf") return new Response("You do not have access to evidence reports.", { status: 403 });

  await db.insert(accessLogs).values({
    merchantId: session.merchant.id,
    userId: session.user.id,
    action: "view_file",
    targetType: "evidence_file",
    targetId: stored.file.id,
    orderId: stored.file.orderId,
    userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
  });

  const download = new URL(request.url).searchParams.get("download") === "1";
  const extension = stored.file.mime === "application/pdf" ? "pdf" : stored.file.mime.split("/")[1] ?? "bin";
  const fileName = `${stored.file.kind}-${stored.file.sha256.slice(0, 10)}.${extension}`;

  const headers: Record<string, string> = {
    "Content-Type": stored.file.mime,
    "Content-Length": String(stored.bytes.length),
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${fileName}"`,
    // Content never changes for a given ID, but it is private to the merchant.
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Evidence-SHA256": stored.file.sha256,
  };
  // Some files come from customers. Opened directly, they get no script access.
  if (stored.file.mime !== "application/pdf") {
    headers["Content-Security-Policy"] = "default-src 'none'; sandbox";
  }

  return new Response(new Uint8Array(stored.bytes), { headers });
}
