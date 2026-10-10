import { describe, expect, it } from "vitest";

import { canonicalize, sha256Hex } from "@/lib/ledger/canonical";
import { eventHash, genesisHash, verifyChain, type ChainEvent, type HashedEvent } from "@/lib/ledger/chain";

const ORDER_ID = "0b6e8f0e-52a1-4b7e-9a57-1f3c5d2a9e10";

function buildChain(count: number): ChainEvent[] {
  const events: ChainEvent[] = [];
  let prevHash = genesisHash(ORDER_ID);
  for (let seq = 1; seq <= count; seq++) {
    const body: HashedEvent = {
      orderId: ORDER_ID,
      seq,
      type: seq === 1 ? "order.placed" : "packing.item_verified",
      occurredAt: new Date(Date.UTC(2026, 9, 10, 12, 0, seq)),
      recordedAt: new Date(Date.UTC(2026, 9, 10, 12, 0, seq, 250)),
      actorType: "system",
      actorId: null,
      actorLabel: "ProofShield",
      source: "test",
      sourceRef: `ref-${seq}`,
      summary: `Event ${seq}`,
      payload: { sku: "VB-CABLE-USBC-2M", quantity: seq },
      attachments: seq === 3 ? [{ fileId: "file-1", sha256: sha256Hex("photo"), kind: "packing_contents_photo" }] : [],
      simulated: false,
    };
    const hash = eventHash(prevHash, body);
    events.push({ ...body, prevHash, hash });
    prevHash = hash;
  }
  return events;
}

describe("canonicalize", () => {
  it("ignores key order and drops undefined", () => {
    expect(canonicalize({ b: 1, a: { d: undefined, c: [3, 2] } })).toBe('{"a":{"c":[3,2]},"b":1}');
    expect(canonicalize({ a: { c: [3, 2] }, b: 1 })).toBe(canonicalize({ b: 1, a: { c: [3, 2] } }));
  });

  it("keeps array order, which is meaningful", () => {
    expect(canonicalize([1, 2])).not.toBe(canonicalize([2, 1]));
  });

  it("serialises dates as ISO strings", () => {
    expect(canonicalize({ at: new Date(Date.UTC(2026, 0, 2, 3, 4, 5)) })).toBe('{"at":"2026-01-02T03:04:05.000Z"}');
  });

  it("rejects values that cannot be reproduced", () => {
    expect(() => canonicalize({ n: Number.NaN })).toThrow();
  });
});

describe("ledger hash chain", () => {
  it("verifies an untouched chain", () => {
    const chain = buildChain(5);
    expect(verifyChain(ORDER_ID, chain, chain[4].hash)).toEqual([]);
  });

  it("verifies regardless of the order rows are loaded in", () => {
    const chain = buildChain(5);
    expect(verifyChain(ORDER_ID, [...chain].reverse(), chain[4].hash)).toEqual([]);
  });

  it("detects an edited summary", () => {
    const chain = buildChain(5);
    chain[2] = { ...chain[2], summary: "Event 3 (edited)" };
    const problems = verifyChain(ORDER_ID, chain, chain[4].hash);
    expect(problems.map((p) => p.kind)).toContain("hash_mismatch");
    expect(problems.find((p) => p.kind === "hash_mismatch")?.seq).toBe(3);
  });

  it("detects an edited payload value", () => {
    const chain = buildChain(4);
    chain[1] = { ...chain[1], payload: { sku: "VB-CABLE-USBC-2M", quantity: 99 } };
    expect(verifyChain(ORDER_ID, chain, chain[3].hash).map((p) => p.kind)).toContain("hash_mismatch");
  });

  it("detects a changed timestamp", () => {
    const chain = buildChain(3);
    chain[0] = { ...chain[0], occurredAt: new Date(chain[0].occurredAt.getTime() - 86_400_000) };
    expect(verifyChain(ORDER_ID, chain, chain[2].hash).map((p) => p.kind)).toContain("hash_mismatch");
  });

  it("detects a swapped attachment hash", () => {
    const chain = buildChain(4);
    chain[2] = {
      ...chain[2],
      attachments: [{ fileId: "file-1", sha256: sha256Hex("another photo"), kind: "packing_contents_photo" }],
    };
    expect(verifyChain(ORDER_ID, chain, chain[3].hash).map((p) => p.kind)).toContain("hash_mismatch");
  });

  it("detects a removed event", () => {
    const chain = buildChain(5);
    const withoutThird = chain.filter((event) => event.seq !== 3);
    const kinds = verifyChain(ORDER_ID, withoutThird, chain[4].hash).map((p) => p.kind);
    expect(kinds).toContain("sequence_gap");
    expect(kinds).toContain("broken_link");
  });

  it("detects a removed final event through the recorded head", () => {
    const chain = buildChain(5);
    const truncated = chain.slice(0, 4);
    expect(verifyChain(ORDER_ID, truncated, chain[4].hash).map((p) => p.kind)).toEqual(["head_mismatch"]);
  });

  it("detects an event rewritten with a recomputed hash", () => {
    // Recomputing one event's own hash still breaks the link from the next event.
    const chain = buildChain(4);
    const edited = { ...chain[1], summary: "Rewritten" };
    edited.hash = eventHash(edited.prevHash, edited);
    chain[1] = edited;
    expect(verifyChain(ORDER_ID, chain, chain[3].hash).map((p) => p.kind)).toContain("broken_link");
  });

  it("gives each order its own starting link", () => {
    expect(genesisHash(ORDER_ID)).not.toBe(genesisHash("11111111-2222-3333-4444-555555555555"));
  });

  it("treats an empty ledger with no head as valid", () => {
    expect(verifyChain(ORDER_ID, [], null)).toEqual([]);
  });
});
