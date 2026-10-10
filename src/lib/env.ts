/**
 * Central environment access.
 *
 * Missing variables are reported by NAME only. Values are never logged,
 * returned to the client, or included in error messages.
 */

const LOCAL_DATABASE_URL =
  "postgres://postgres:postgres@127.0.0.1:54329/proofshield";
const LOCAL_DEMO_PASSWORD = "proofshield-local";

/** True on Vercel (build and runtime). Local runs fall back to dev defaults. */
export const isHosted = Boolean(process.env.VERCEL);

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

export class MissingEnvError extends Error {
  constructor(public readonly variable: string) {
    super(`Missing environment variable: ${variable}`);
    this.name = "MissingEnvError";
  }
}

function required(name: string, value: string | undefined): string {
  if (!value) throw new MissingEnvError(name);
  return value;
}

/** Pooled connection string used by the app at runtime. */
export function databaseUrl(): string | undefined {
  return (
    read("DATABASE_URL") ??
    read("POSTGRES_URL") ??
    (isHosted ? undefined : LOCAL_DATABASE_URL)
  );
}

/** Direct connection string preferred for migrations. */
export function migrationDatabaseUrl(): string | undefined {
  return (
    read("DATABASE_URL_UNPOOLED") ??
    read("POSTGRES_URL_NON_POOLING") ??
    databaseUrl()
  );
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL", databaseUrl());
  },
  get stripeSecretKey() {
    return required("STRIPE_SECRET_KEY", read("STRIPE_SECRET_KEY"));
  },
  get stripeWebhookSecret() {
    return required("STRIPE_WEBHOOK_SECRET", read("STRIPE_WEBHOOK_SECRET"));
  },
  get stripeCurrency() {
    return (read("STRIPE_CURRENCY") ?? "eur").toLowerCase();
  },
  get openRouterApiKey() {
    return required("OPENROUTER_API_KEY", read("OPENROUTER_API_KEY"));
  },
  get openRouterModel() {
    return read("OPENROUTER_MODEL") ?? "anthropic/claude-sonnet-5.5";
  },
  /** Shared password for the seeded demo accounts. */
  get demoPassword() {
    return read("DEMO_PASSWORD") ?? (isHosted ? undefined : LOCAL_DEMO_PASSWORD);
  },
  /** Demo controls (held disputes, courier simulator, seed and reset). */
  get demoMode() {
    return (read("DEMO_MODE") ?? "true").toLowerCase() !== "false";
  },
  /** Public base URL, when it cannot be derived from the request. */
  get appUrl() {
    const explicit = read("APP_URL");
    if (explicit) return explicit.replace(/\/$/, "");
    const vercel = read("VERCEL_PROJECT_PRODUCTION_URL");
    if (vercel) return `https://${vercel}`;
    return "http://localhost:3000";
  },
};

export type EnvCheck = {
  name: string;
  present: boolean;
  /** Plain-language reason the variable is needed. */
  neededFor: string;
};

/** Setup status for the health endpoint and setup notice. Names only. */
export function envChecks(): EnvCheck[] {
  return [
    {
      name: "DATABASE_URL",
      present: Boolean(databaseUrl()),
      neededFor: "storing orders and evidence",
    },
    {
      name: "DEMO_PASSWORD",
      present: Boolean(env.demoPassword),
      neededFor: "creating the demo logins",
    },
    {
      name: "STRIPE_SECRET_KEY",
      present: Boolean(read("STRIPE_SECRET_KEY")),
      neededFor: "checkout, refunds and dispute responses",
    },
    {
      name: "STRIPE_WEBHOOK_SECRET",
      present: Boolean(read("STRIPE_WEBHOOK_SECRET")),
      neededFor: "receiving payment and dispute events from Stripe",
    },
    {
      name: "OPENROUTER_API_KEY",
      present: Boolean(read("OPENROUTER_API_KEY")),
      neededFor: "AI investigations and rebuttal drafts",
    },
  ];
}

export function missingEnv(): EnvCheck[] {
  return envChecks().filter((check) => !check.present);
}

export function isDatabaseConfigured(): boolean {
  return Boolean(databaseUrl());
}

export function isStripeConfigured(): boolean {
  return Boolean(read("STRIPE_SECRET_KEY"));
}

export function isAiConfigured(): boolean {
  return Boolean(read("OPENROUTER_API_KEY"));
}

export function isWebhookConfigured(): boolean {
  return Boolean(read("STRIPE_WEBHOOK_SECRET"));
}
