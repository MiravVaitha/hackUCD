import { randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { cache } from "react";

import { db } from "@/db/client";
import { merchants, sessions, users, type Merchant, type UserRole } from "@/db/schema";
import { sha256Hex } from "@/lib/ledger/canonical";

export const SESSION_COOKIE = "ps_session";
const SESSION_DAYS = 14;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

export type SessionContext = {
  sessionId: string;
  user: SessionUser;
  merchant: Merchant;
};

/**
 * Start a session for a user. The browser holds a random token; the database
 * holds only its SHA-256, so a database leak does not expose usable sessions.
 */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;

  await db.insert(sessions).values({
    userId,
    tokenHash: sha256Hex(token),
    userAgent,
    expiresAt,
  });

  // Opportunistic clean-up of expired sessions.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** The signed-in user and their merchant, or null. Memoised per request. */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({ session: sessions, user: users, merchant: merchants })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(merchants, eq(merchants.id, users.merchantId))
    .where(and(eq(sessions.tokenHash, sha256Hex(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;

  return {
    sessionId: row.session.id,
    user: {
      id: row.user.id,
      email: row.user.email,
      name: row.user.name,
      role: row.user.role,
    },
    merchant: row.merchant,
  };
});

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, sha256Hex(token)));
  }
  cookieStore.delete(SESSION_COOKIE);
}
