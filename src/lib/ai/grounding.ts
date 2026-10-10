/**
 * Checks run on every AI answer before a person sees it. The model is asked
 * to cite its sources; these checks do not take its word for it.
 */

export type WordingFlag = { term: string; excerpt: string };

export type GroundingReport = {
  /** Statements that had to cite evidence. */
  statementsChecked: number;
  /** Citations that pointed at something not in the evidence bundle. They were removed. */
  invalidCitations: string[];
  /** Statements left with no valid citation. They were moved out of the verified list. */
  uncitedStatements: number;
  /** Wording in customer-facing text that could read as an accusation. */
  wordingFlags: WordingFlag[];
  /** Amounts, dates, times or reference numbers in the text that do not appear in the evidence. */
  unsupportedSpecifics: string[];
  passed: boolean;
};

export type CitedStatement = { statement: string; evidence_ids: string[] };

/** Normalise "e4", "[E4]" or "E4." to "E4". */
export function normaliseEvidenceId(raw: string): string {
  return raw
    .trim()
    .replace(/^[\[(]+|[\]).,;:]+$/g, "")
    .toUpperCase();
}

/**
 * Keep only citations that exist in the bundle. Returns the cleaned statements
 * split into those still backed by a source and those that are not.
 */
export function checkCitations(
  statements: CitedStatement[],
  validIds: ReadonlySet<string>,
): { cited: CitedStatement[]; uncited: CitedStatement[]; invalid: string[] } {
  const cited: CitedStatement[] = [];
  const uncited: CitedStatement[] = [];
  const invalid: string[] = [];

  for (const item of statements) {
    const kept: string[] = [];
    for (const raw of item.evidence_ids) {
      const id = normaliseEvidenceId(raw);
      if (validIds.has(id)) {
        if (!kept.includes(id)) kept.push(id);
      } else if (id) {
        invalid.push(id);
      }
    }
    const cleaned = { statement: item.statement, evidence_ids: kept };
    if (kept.length > 0) cited.push(cleaned);
    else uncited.push(cleaned);
  }

  return { cited, uncited, invalid };
}

/** Clean a list of bare citations (not attached to a statement). */
export function cleanIds(ids: string[], validIds: ReadonlySet<string>): { kept: string[]; invalid: string[] } {
  const kept: string[] = [];
  const invalid: string[] = [];
  for (const raw of ids) {
    const id = normaliseEvidenceId(raw);
    if (validIds.has(id)) {
      if (!kept.includes(id)) kept.push(id);
    } else if (id) {
      invalid.push(id);
    }
  }
  return { kept, invalid };
}

// Words that accuse, or that a customer would reasonably read as an accusation.
const ACCUSATORY = [
  "fraud",
  "fraudulent",
  "fraudster",
  "scam",
  "scammer",
  "liar",
  "lying",
  "lied",
  "dishonest",
  "dishonesty",
  "deceive",
  "deceiving",
  "deceit",
  "thief",
  "theft",
  "stole",
  "stolen",
  "steal",
  "stealing",
  "criminal",
  "police",
  "false claim",
  "falsely",
  "fabricate",
  "fabricated",
  "abuse",
  "abusing",
  "prove you",
  "we know you",
  "you claim",
  "you allege",
];

const ACCUSATORY_PATTERN = new RegExp(
  `\\b(${ACCUSATORY.map((term) => term.replace(/\s+/g, "\\s+")).join("|")})\\b`,
  "gi",
);

/** Find wording in customer-facing text that a person should look at before sending. */
export function findAccusatoryWording(text: string): WordingFlag[] {
  const flags: WordingFlag[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(ACCUSATORY_PATTERN)) {
    const term = match[0].toLowerCase().replace(/\s+/g, " ");
    if (seen.has(term)) continue;
    seen.add(term);
    const index = match.index ?? 0;
    const start = Math.max(0, index - 40);
    const end = Math.min(text.length, index + match[0].length + 40);
    flags.push({ term, excerpt: text.slice(start, end).replace(/\s+/g, " ").trim() });
  }
  return flags;
}

const MONTHS = "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";

const SPECIFIC_PATTERNS: RegExp[] = [
  /(?:€|£|\$)\s?\d[\d,]*(?:\.\d{2})?/g, // money
  /\b[A-Z]{2,4}\d{6,}[A-Z]{0,3}\b/g, // tracking numbers
  /\b[A-Z]{1,4}-\d{3,8}\b/g, // order and complaint numbers
  /\b(?:pi|ch|du|dp|re|cs)_[A-Za-z0-9]{8,}\b/g, // processor references
  /\b\d{1,2}:\d{2}(?::\d{2})?\b/g, // times
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})(?:\\s+\\d{4})?\\b`, "gi"), // dates
];

function canonical(value: string): string {
  return value
    .toLowerCase()
    .replace(/(\d)(st|nd|rd|th)\b/g, "$1")
    .replace(/[\s,]+/g, "");
}

/** Reduce "10 October 2026" and "10 Oct 2026" to the same thing. */
function canonicalDate(value: string): string {
  return canonical(value).replace(
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/g,
    (_match, month: string) => month,
  );
}

/**
 * Find amounts, dates, times and reference numbers in generated text that do
 * not appear in the evidence. These are the details a model is most likely to
 * invent, and the ones that matter most if wrong.
 */
export function findUnsupportedSpecifics(text: string, evidence: string): string[] {
  const haystack = canonical(evidence);
  const dateHaystack = canonicalDate(evidence);
  const unsupported: string[] = [];

  for (const pattern of SPECIFIC_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const value = match[0].trim();
      const isDate = /[a-z]{3}/i.test(value) && /\d/.test(value) && !/[_-]/.test(value) && !/^[A-Z]{2,4}\d/.test(value);
      const found = isDate
        ? dateHaystack.includes(canonicalDate(value))
        : haystack.includes(canonical(value)) ||
          // "13:19" is supported by an evidence time of "13:19:04".
          (/^\d{1,2}:\d{2}$/.test(value) && haystack.includes(canonical(value) + ":"));
      if (!found && !unsupported.includes(value)) unsupported.push(value);
    }
  }
  return unsupported;
}

export function buildReport(input: {
  statementsChecked: number;
  invalidCitations: string[];
  uncitedStatements: number;
  wordingFlags: WordingFlag[];
  unsupportedSpecifics: string[];
}): GroundingReport {
  const invalid = [...new Set(input.invalidCitations)];
  return {
    statementsChecked: input.statementsChecked,
    invalidCitations: invalid,
    uncitedStatements: input.uncitedStatements,
    wordingFlags: input.wordingFlags,
    unsupportedSpecifics: input.unsupportedSpecifics,
    passed:
      invalid.length === 0 &&
      input.uncitedStatements === 0 &&
      input.wordingFlags.length === 0 &&
      input.unsupportedSpecifics.length === 0,
  };
}
