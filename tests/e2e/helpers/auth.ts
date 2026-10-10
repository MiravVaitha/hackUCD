import "../../setup-env";

import { randomBytes } from "node:crypto";
import type { BrowserContext } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { merchants, sessions, users, type UserRole } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { DEMO_MERCHANT, DEMO_USERS } from "@/lib/catalog";
import { sha256Hex } from "@/lib/ledger/canonical";

const SESSION_COOKIE = "ps_session";

/**
 * Sign a browser context in as one of the seeded demo users by creating a
 * session directly. Tests never need to know or type the demo password.
 */
export async function signInAs(context: BrowserContext, role: UserRole, baseURL: string): Promise<void> {
  const email = DEMO_USERS.find((user) => user.role === role)?.email;
  if (!email) throw new Error(`No demo user with role ${role}`);
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) throw new Error(`Demo user ${email} is missing. Run pnpm db:bootstrap.`);

  const token = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: sha256Hex(token),
    userAgent: "playwright",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  const url = new URL(baseURL);
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: token,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "Lax",
    },
  ]);
}

/** A temporary account with a random password, for exercising the real login form. */
export async function createTemporaryUser(role: UserRole = "agent") {
  const [merchant] = await db
    .select()
    .from(merchants)
    .where(eq(merchants.slug, DEMO_MERCHANT.slug))
    .limit(1);
  if (!merchant) throw new Error("Demo merchant missing. Run pnpm db:bootstrap.");

  const suffix = randomBytes(4).toString("hex");
  const email = `e2e-${suffix}@voltbox.test`;
  const password = `e2e-${randomBytes(9).toString("base64url")}`;
  const [user] = await db
    .insert(users)
    .values({
      merchantId: merchant.id,
      email,
      name: "E2E Tester",
      role,
      passwordHash: await hashPassword(password),
    })
    .returning();

  return {
    email,
    password,
    remove: async () => {
      await db.delete(users).where(eq(users.id, user.id));
    },
  };
}
