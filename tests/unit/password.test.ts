import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(true);
    expect(await verifyPassword("correct horse battery stapler", stored)).toBe(false);
  });

  it("salts each hash", async () => {
    const first = await hashPassword("same password");
    const second = await hashPassword("same password");
    expect(first).not.toBe(second);
  });

  it("never stores the password itself", async () => {
    const stored = await hashPassword("visible-secret");
    expect(stored).not.toContain("visible-secret");
    expect(stored.startsWith("scrypt$")).toBe(true);
  });

  it("rejects malformed stored values instead of throwing", async () => {
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
    expect(await verifyPassword("anything", "scrypt$16384$8$1$c2FsdA$dG9vc2hvcnQ")).toBe(false);
  });
});
