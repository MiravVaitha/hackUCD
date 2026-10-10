import { redirect } from "next/navigation";

import type { UserRole } from "@/db/schema";
import type { LedgerActor } from "@/lib/ledger/append";
import { getSession, type SessionContext } from "./session";
import { hasSubscription } from "@/lib/subscription";

/** Where each role lands after signing in. */
export function homeForRole(role: UserRole): string {
  return role === "packer" ? "/app/pack" : "/app";
}

/** Roles that work in the merchant console (everything except the packing station). */
export const CONSOLE_ROLES: UserRole[] = ["owner", "agent"];

/**
 * Require a signed-in user for a page. This is the real access check; the
 * proxy only does an optimistic redirect for requests with no session cookie.
 */
export async function requireUser(roles?: UserRole[], allowUnsubscribed = true): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!allowUnsubscribed && !hasSubscription(session.merchant)) redirect("/account");
  if (roles && !roles.includes(session.user.role)) {
    redirect(homeForRole(session.user.role));
  }
  return session;
}

export class NotSignedInError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "NotSignedInError";
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super("You do not have access to this action");
    this.name = "ForbiddenError";
  }
}

/** Access check for server actions and route handlers: throws instead of redirecting. */
export async function requireUserForAction(roles?: UserRole[], allowUnsubscribed = true): Promise<SessionContext> {
  const session = await getSession();
  if (!session) throw new NotSignedInError();
  if (!allowUnsubscribed && !hasSubscription(session.merchant)) throw new SubscriptionRequiredError();
  if (roles && !roles.includes(session.user.role)) throw new ForbiddenError();
  return session;
}

export class SubscriptionRequiredError extends Error {
  constructor() { super("Verity Premium (€2.49/month) is required for AI features. Upgrade in Account."); this.name = "SubscriptionRequiredError"; }
}

/** Ledger attribution for something a signed-in person did. */
export function actorFor(session: SessionContext): LedgerActor {
  return { type: "user", id: session.user.id, label: session.user.name };
}

export function requirePremium(context: SessionContext) {
  if (!hasSubscription(context.merchant)) throw new SubscriptionRequiredError();
}
