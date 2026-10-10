import { createHash } from "node:crypto";

/**
 * Deterministic JSON: object keys sorted, no whitespace, dates as ISO strings,
 * undefined values dropped. Two structurally equal values always produce the
 * same string, which is what makes the hash chain reproducible.
 */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null";

  if (value instanceof Date) return JSON.stringify(value.toISOString());

  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new Error("Cannot canonicalize a non-finite number");
      }
      return JSON.stringify(value);
    case "bigint":
      return JSON.stringify(value.toString());
    case "object":
      break;
    default:
      throw new Error(`Cannot canonicalize a value of type ${typeof value}`);
  }

  if (Array.isArray(value)) {
    return "[" + value.map((item) => canonicalize(item)).join(",") + "]";
  }

  const record = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of Object.keys(record).sort()) {
    const item = record[key];
    if (item === undefined) continue;
    parts.push(JSON.stringify(key) + ":" + canonicalize(item));
  }
  return "{" + parts.join(",") + "}";
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Round-trip a value through JSON so what gets hashed is exactly what the
 * database will hand back (no undefined, no Date objects, no class instances).
 */
export function toPlainJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T;
}
