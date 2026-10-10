import { z } from "zod";

/**
 * Output contracts for the two AI tasks. Each has a JSON Schema, sent to the
 * model so its answer is constrained, and a Zod schema, used to check the
 * answer again when it comes back.
 *
 * The JSON Schemas stick to what strict structured output supports: plain
 * types and enums, every property required, no extra properties.
 */

export const COMPLAINT_CATEGORIES = [
  "not_received",
  "missing_item",
  "wrong_item",
  "damaged",
  "billing_confusion",
  "refund_request",
  "other",
] as const;

export const EVIDENCE_POSITIONS = ["supports_customer", "differs_from_customer", "mixed", "inconclusive"] as const;

export const RESOLUTION_ACTIONS = [
  "clarify",
  "request_information",
  "refund_full",
  "refund_partial",
  "send_replacement",
  "carrier_claim",
  "no_action",
] as const;

export type ResolutionAction = (typeof RESOLUTION_ACTIONS)[number];
export type EvidencePosition = (typeof EVIDENCE_POSITIONS)[number];

const citedStatement = z.object({
  statement: z.string().min(1),
  evidence_ids: z.array(z.string()),
});

export const investigationSchema = z.object({
  category: z.enum(COMPLAINT_CATEGORIES),
  claim_summary: z.string().min(1),
  verified_facts: z.array(citedStatement),
  cannot_verify: z.array(z.object({ statement: z.string().min(1), why: z.string() })),
  inconsistencies: z.array(citedStatement),
  evidence_position: z.object({
    position: z.enum(EVIDENCE_POSITIONS),
    explanation: z.string(),
  }),
  suggested_resolution: z.object({
    action: z.enum(RESOLUTION_ACTIONS),
    rationale: z.string().min(1),
    evidence_ids: z.array(z.string()),
    refund_amount_minor: z.number().int().nonnegative().nullable(),
  }),
  alternatives: z.array(z.object({ action: z.enum(RESOLUTION_ACTIONS), when_to_choose: z.string() })),
  customer_reply: z.object({ subject: z.string().min(1), body: z.string().min(1) }),
  internal_note: z.string(),
});

export type Investigation = z.infer<typeof investigationSchema>;

const citedStatementJson = {
  type: "object",
  properties: {
    statement: { type: "string", description: "One plain sentence." },
    evidence_ids: {
      type: "array",
      items: { type: "string" },
      description: "IDs of the evidence entries that support the statement, e.g. E4, E7, POL-REFUND.",
    },
  },
  required: ["statement", "evidence_ids"],
  additionalProperties: false,
};

export const investigationJsonSchema = {
  type: "object",
  properties: {
    category: {
      type: "string",
      enum: [...COMPLAINT_CATEGORIES],
      description:
        "What the complaint is about: not_received (parcel never arrived), missing_item (parcel arrived without something), " +
        "wrong_item, damaged, billing_confusion (does not recognise or understand a charge), refund_request, other.",
    },
    claim_summary: {
      type: "string",
      description: "One or two sentences: what the customer says happened and what they want.",
    },
    verified_facts: {
      type: "array",
      items: citedStatementJson,
      description: "What the records establish that bears on this complaint. Each must cite evidence.",
    },
    cannot_verify: {
      type: "array",
      items: {
        type: "object",
        properties: {
          statement: { type: "string", description: "Something relevant that the records do not establish." },
          why: { type: "string", description: "Why the records cannot settle it, or what is missing." },
        },
        required: ["statement", "why"],
        additionalProperties: false,
      },
    },
    inconsistencies: {
      type: "array",
      items: citedStatementJson,
      description:
        "Places where the records differ from the customer's account, or from each other. Empty when there are none.",
    },
    evidence_position: {
      type: "object",
      properties: {
        position: {
          type: "string",
          enum: [...EVIDENCE_POSITIONS],
          description:
            "supports_customer: the records back the customer's account or show a merchant or courier failure. " +
            "differs_from_customer: the records describe something different from the customer's account. " +
            "mixed: some of each. inconclusive: the records cannot settle it.",
        },
        explanation: { type: "string", description: "One or two sentences." },
      },
      required: ["position", "explanation"],
      additionalProperties: false,
    },
    suggested_resolution: {
      type: "object",
      properties: {
        action: { type: "string", enum: [...RESOLUTION_ACTIONS] },
        rationale: { type: "string", description: "Two or three sentences on why this is the fair action." },
        evidence_ids: { type: "array", items: { type: "string" } },
        refund_amount_minor: {
          type: ["integer", "null"],
          description: "Refund amount in minor units (cents) for refund actions, otherwise null.",
        },
      },
      required: ["action", "rationale", "evidence_ids", "refund_amount_minor"],
      additionalProperties: false,
    },
    alternatives: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action: { type: "string", enum: [...RESOLUTION_ACTIONS] },
          when_to_choose: { type: "string" },
        },
        required: ["action", "when_to_choose"],
        additionalProperties: false,
      },
    },
    customer_reply: {
      type: "object",
      properties: {
        subject: { type: "string" },
        body: { type: "string", description: "Plain text, short paragraphs separated by blank lines." },
      },
      required: ["subject", "body"],
      additionalProperties: false,
    },
    internal_note: {
      type: "string",
      description: "Anything the agent should check or bear in mind that does not belong in the reply. May be empty.",
    },
  },
  required: [
    "category",
    "claim_summary",
    "verified_facts",
    "cannot_verify",
    "inconsistencies",
    "evidence_position",
    "suggested_resolution",
    "alternatives",
    "customer_reply",
    "internal_note",
  ],
  additionalProperties: false,
} as const;

// --- Dispute rebuttal -------------------------------------------------------

export const REBUTTAL_RECOMMENDATIONS = ["challenge", "accept"] as const;

export const rebuttalSchema = z.object({
  recommendation: z.object({
    decision: z.enum(REBUTTAL_RECOMMENDATIONS),
    reasoning: z.string().min(1),
  }),
  summary: z.string().min(1),
  rebuttal_points: z.array(citedStatement),
  rebuttal_text: z.string().min(1),
  product_description: z.string(),
  weaknesses: z.array(z.object({ issue: z.string().min(1), impact: z.string() })),
});

export type Rebuttal = z.infer<typeof rebuttalSchema>;

export const rebuttalJsonSchema = {
  type: "object",
  properties: {
    recommendation: {
      type: "object",
      properties: {
        decision: {
          type: "string",
          enum: [...REBUTTAL_RECOMMENDATIONS],
          description:
            "challenge: the evidence gives a reasonable case. accept: the evidence does not support the merchant, " +
            "or supports the cardholder.",
        },
        reasoning: { type: "string", description: "Two or three sentences for the merchant." },
      },
      required: ["decision", "reasoning"],
      additionalProperties: false,
    },
    summary: {
      type: "string",
      description: "Two or three sentences for the merchant: what the bank is told and what the response rests on.",
    },
    rebuttal_points: {
      type: "array",
      items: citedStatementJson,
      description: "The factual points the response makes, in the order they happened. Each must cite evidence.",
    },
    rebuttal_text: {
      type: "string",
      description:
        "The response to the card issuer. Plain text, chronological, factual, under 350 words. No evidence IDs.",
    },
    product_description: {
      type: "string",
      description: "One or two sentences describing what was sold, for the issuer.",
    },
    weaknesses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          issue: { type: "string", description: "Evidence that is missing or works against the merchant." },
          impact: { type: "string", description: "How it could affect the outcome." },
        },
        required: ["issue", "impact"],
        additionalProperties: false,
      },
      description: "Honest gaps in the merchant's case. Empty only if there are none.",
    },
  },
  required: ["recommendation", "summary", "rebuttal_points", "rebuttal_text", "product_description", "weaknesses"],
  additionalProperties: false,
} as const;
