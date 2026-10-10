import { env } from "@/lib/env";

/**
 * Minimal OpenRouter client for one job: ask a model for a JSON object that
 * follows a schema, and return it with usage figures.
 *
 * Notes on the request shape, for the current Claude models on OpenRouter:
 * - Sampling parameters (temperature, top_p) are not accepted, so none are sent.
 * - Reasoning cannot be switched off; its depth is set with `reasoning.effort`.
 * - Reasoning tokens count against `max_tokens`, so the limit is generous.
 * - `response_format: json_schema` with `strict` constrains the output, and
 *   `provider.require_parameters` keeps the request on endpoints that honour it.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 110_000;

export type ReasoningEffort = "low" | "medium" | "high";

export type StructuredRequest = {
  system: string;
  user: string;
  schemaName: string;
  /** JSON Schema: objects need `additionalProperties: false` and every property listed in `required`. */
  schema: Record<string, unknown>;
  model?: string;
  effort?: ReasoningEffort;
  maxTokens?: number;
};

export type StructuredResponse = {
  data: unknown;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  latencyMs: number;
};

/** A failure the merchant can be told about in plain words. Never contains the API key. */
export class AiError extends Error {
  constructor(
    message: string,
    public readonly kind: "not_configured" | "refused" | "truncated" | "invalid_output" | "provider" | "timeout",
  ) {
    super(message);
    this.name = "AiError";
  }
}

export type StructuredCompletion = (request: StructuredRequest) => Promise<StructuredResponse>;

type ChatCompletion = {
  model?: string;
  error?: { message?: string; code?: number | string };
  choices?: {
    finish_reason?: string | null;
    native_finish_reason?: string | null;
    message?: { content?: string | null; refusal?: string | null };
    error?: { message?: string };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
};

function effortFromEnv(): ReasoningEffort {
  const value = process.env.OPENROUTER_REASONING_EFFORT?.toLowerCase();
  return value === "medium" || value === "high" ? value : "low";
}

/** Models sometimes wrap JSON in a code fence even when asked not to. */
function parseJsonObject(content: string): unknown {
  const trimmed = content.trim();
  const unfenced = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "")
    : trimmed;
  return JSON.parse(unfenced);
}

export const completeStructured: StructuredCompletion = async (request) => {
  let apiKey: string;
  try {
    apiKey = env.openRouterApiKey;
  } catch {
    throw new AiError("AI is not set up on this deployment: OPENROUTER_API_KEY is missing.", "not_configured");
  }

  const model = request.model ?? env.openRouterModel;
  const started = Date.now();

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": env.appUrl,
        "X-Title": "ProofShield AI",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: request.schemaName, strict: true, schema: request.schema },
        },
        provider: { require_parameters: true },
        reasoning: { effort: request.effort ?? effortFromEnv(), exclude: true },
        max_tokens: request.maxTokens ?? 16_000,
        usage: { include: true },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new AiError("The AI took too long to answer. Try again.", "timeout");
    }
    throw new AiError("The AI service could not be reached. Try again.", "provider");
  }

  const latencyMs = Date.now() - started;
  const body = (await response.json().catch(() => null)) as ChatCompletion | null;

  if (!response.ok || !body || body.error) {
    const detail = body?.error?.message?.slice(0, 300);
    const status = response.status;
    if (status === 401 || status === 403) {
      throw new AiError("The AI service rejected the API key configured for this deployment.", "provider");
    }
    if (status === 402) {
      throw new AiError("The AI account has run out of credit.", "provider");
    }
    if (status === 429) {
      throw new AiError("The AI service is rate limiting requests. Wait a moment and try again.", "provider");
    }
    throw new AiError(`The AI service returned an error${detail ? `: ${detail}` : "."}`, "provider");
  }

  const choice = body.choices?.[0];
  if (!choice) throw new AiError("The AI returned an empty response.", "provider");
  if (choice.error?.message) {
    throw new AiError(`The AI service returned an error: ${choice.error.message.slice(0, 300)}`, "provider");
  }

  const finish = choice.finish_reason ?? "";
  if (finish === "content_filter" || choice.native_finish_reason === "refusal" || choice.message?.refusal) {
    throw new AiError("The AI declined to answer this request.", "refused");
  }
  if (finish === "length") {
    throw new AiError("The AI's answer was cut off before it finished. Try again.", "truncated");
  }

  const content = choice.message?.content;
  if (!content) throw new AiError("The AI returned an empty response.", "invalid_output");

  let data: unknown;
  try {
    data = parseJsonObject(content);
  } catch {
    throw new AiError("The AI's answer was not valid JSON. Try again.", "invalid_output");
  }

  return {
    data,
    model: body.model ?? model,
    tokensIn: body.usage?.prompt_tokens ?? null,
    tokensOut: body.usage?.completion_tokens ?? null,
    costUsd: typeof body.usage?.cost === "number" ? body.usage.cost : null,
    latencyMs,
  };
};
