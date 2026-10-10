"use server";

import { and, eq, gt, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { loginAttempts, users } from "@/db/schema";
import { homeForRole } from "@/lib/auth/guards";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";

export type LoginState = { error: string | null; email: string };

const MAX_FAILED_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MINUTES = 10;

// Compared against when the email is unknown, so both paths take similar time.
let decoyHash: Promise<string> | null = null;
function getDecoyHash(): Promise<string> {
  decoyHash ??= hashPassword("proofshield-decoy-password");
  return decoyHash;
}

function safeNextPath(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  // Only same-site paths inside the merchant app.
  return /^\/app(\/[\w\-./?=&%]*)?$/.test(value) ? value : null;
}

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));

  if (!email || !password) {
    return { error: "Enter your email and password.", email };
  }

  const windowStart = new Date(Date.now() - ATTEMPT_WINDOW_MINUTES * 60 * 1000);
  const [recent] = await db
    .select({ failures: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.email, email),
        eq(loginAttempts.succeeded, false),
        gt(loginAttempts.at, windowStart),
      ),
    );
  if ((recent?.failures ?? 0) >= MAX_FAILED_ATTEMPTS) {
    return { error: "Too many attempts. Wait a few minutes and try again.", email };
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const valid = await verifyPassword(password, user?.passwordHash ?? (await getDecoyHash()));

  await db.insert(loginAttempts).values({ email, succeeded: Boolean(user && valid) });

  if (!user || !valid) {
    return { error: "That email and password do not match.", email };
  }

  await createSession(user.id);
  redirect(next ?? homeForRole(user.role));
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
