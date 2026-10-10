import { describe, expect, it } from "vitest";

import {
  checkCitations,
  findAccusatoryWording,
  findUnsupportedSpecifics,
  normaliseEvidenceId,
} from "@/lib/ai/grounding";
import { groundInvestigation } from "@/lib/ai/investigate";
import type { Investigation } from "@/lib/ai/schemas";

const EVIDENCE = [
  "ORDER VB-1042 from Voltbox.",
  "Totals: subtotal €103.00, delivery €4.95, total €107.95.",
  "[E1] 10 Oct 2026, 13:19:04 | Order placed",
  "[E7] 10 Oct 2026, 13:42:10 | Packing completed",
  "[E9] 11 Oct 2026, 09:15:00 | Delivered | source: SwiftParcel demo courier SWP0001042IE",
  "[POL-REFUND] Refund policy: 30 days.",
  '[M1] 12 Oct 2026, 10:02:00 | from customer: "It never arrived."',
].join("\n");
const IDS = ["E1", "E7", "E9", "POL-REFUND", "M1"];

function investigation(overrides: Partial<Investigation> = {}): Investigation {
  return {
    category: "not_received",
    claim_summary: "The customer says the parcel never arrived.",
    verified_facts: [
      { statement: "Packing was completed on 10 Oct 2026.", evidence_ids: ["E7"] },
      { statement: "The courier recorded delivery on 11 Oct 2026.", evidence_ids: ["E9"] },
    ],
    cannot_verify: [{ statement: "Whether the customer has the parcel.", why: "A delivery scan does not show that." }],
    inconsistencies: [],
    evidence_position: { position: "differs_from_customer", explanation: "The courier recorded a delivery." },
    suggested_resolution: { action: "clarify", rationale: "Share the delivery record.", evidence_ids: ["E9"], refund_amount_minor: null },
    alternatives: [],
    customer_reply: {
      subject: "Your order VB-1042",
      body: "I'm sorry your parcel hasn't turned up. Our courier recorded it as delivered on 11 Oct 2026 at 09:15 under tracking number SWP0001042IE.",
    },
    internal_note: "",
    ...overrides,
  };
}

describe("citation checks", () => {
  it("normalises the ways a model writes an ID", () => {
    expect(normaliseEvidenceId(" [e7]. ")).toBe("E7");
    expect(normaliseEvidenceId("pol-refund")).toBe("POL-REFUND");
  });

  it("keeps statements whose citations exist", () => {
    const result = checkCitations([{ statement: "Packed.", evidence_ids: ["E7", "[e9]"] }], new Set(IDS));
    expect(result.cited).toEqual([{ statement: "Packed.", evidence_ids: ["E7", "E9"] }]);
    expect(result.invalid).toEqual([]);
  });

  it("drops citations that point at nothing and separates statements left unsupported", () => {
    const result = checkCitations(
      [
        { statement: "Signed for by the customer.", evidence_ids: ["E42"] },
        { statement: "Delivered.", evidence_ids: ["E9", "E99"] },
        { statement: "No source at all.", evidence_ids: [] },
      ],
      new Set(IDS),
    );
    expect(result.invalid).toEqual(["E42", "E99"]);
    expect(result.cited.map((item) => item.statement)).toEqual(["Delivered."]);
    expect(result.uncited.map((item) => item.statement)).toEqual(["Signed for by the customer.", "No source at all."]);
  });
});

describe("wording check on customer-facing text", () => {
  it("passes a neutral reply", () => {
    expect(findAccusatoryWording("I'm sorry your parcel hasn't arrived. Our courier recorded a delivery.")).toEqual([]);
  });

  it("flags accusations for a person to review", () => {
    const flags = findAccusatoryWording("Our records prove you are lying, and we treat this as a fraudulent claim.");
    expect(flags.map((flag) => flag.term)).toEqual(expect.arrayContaining(["lying", "fraudulent"]));
    expect(flags[0].excerpt.length).toBeGreaterThan(5);
  });

  it("does not flag ordinary words that contain a flagged word", () => {
    expect(findAccusatoryWording("We believe the courier's record. Please check with relatives or neighbours.")).toEqual([]);
  });
});

describe("specifics check", () => {
  it("accepts amounts, dates, times and references that are in the evidence", () => {
    const text = "Order VB-1042 for €107.95 was delivered on 11 October 2026 at 09:15, tracking SWP0001042IE.";
    expect(findUnsupportedSpecifics(text, EVIDENCE)).toEqual([]);
  });

  it("reports details that are not in the evidence", () => {
    const text = "We refunded €12.00 on 14 Oct 2026 at 16:45. Your new tracking number is SWP0009999IE.";
    expect(findUnsupportedSpecifics(text, EVIDENCE)).toEqual(
      expect.arrayContaining(["€12.00", "14 Oct 2026", "16:45", "SWP0009999IE"]),
    );
  });
});

describe("grounding an investigation", () => {
  it("passes a well-cited investigation unchanged", () => {
    const { investigation: result, report } = groundInvestigation(investigation(), { text: EVIDENCE, ids: IDS });
    expect(report.passed).toBe(true);
    expect(report.statementsChecked).toBe(2);
    expect(result.verified_facts).toHaveLength(2);
  });

  it("moves an uncited 'fact' to cannot-verify and fails the check", () => {
    const { investigation: result, report } = groundInvestigation(
      investigation({
        verified_facts: [
          { statement: "The customer signed for the parcel.", evidence_ids: ["E55"] },
          { statement: "The courier recorded delivery.", evidence_ids: ["E9"] },
        ],
      }),
      { text: EVIDENCE, ids: IDS },
    );
    expect(report.passed).toBe(false);
    expect(report.invalidCitations).toEqual(["E55"]);
    expect(report.uncitedStatements).toBe(1);
    expect(result.verified_facts.map((fact) => fact.statement)).toEqual(["The courier recorded delivery."]);
    expect(result.cannot_verify.map((item) => item.statement)).toContain("The customer signed for the parcel.");
  });

  it("flags an accusatory or unsupported reply without rewriting it", () => {
    const reply = {
      subject: "Your order",
      body: "Our records show this is a fraudulent claim. We refunded €55.00 yesterday.",
    };
    const { investigation: result, report } = groundInvestigation(investigation({ customer_reply: reply }), {
      text: EVIDENCE,
      ids: IDS,
    });
    expect(report.passed).toBe(false);
    expect(report.wordingFlags.map((flag) => flag.term)).toContain("fraudulent");
    expect(report.unsupportedSpecifics).toContain("€55.00");
    // The draft is shown to the agent as written, with the flags beside it.
    expect(result.customer_reply).toEqual(reply);
  });
});
