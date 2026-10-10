import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionContext } from "@/lib/auth/session";
const mock = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/auth/session", () => mock);
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
import { requirePremium, requireUser, requireUserForAction } from "@/lib/auth/guards";
describe("free workspace and paid AI", () => {
  const free = { merchant: { settings: {} }, user: { role: "owner" } } as SessionContext;
  beforeEach(() => mock.getSession.mockResolvedValue(free));
  it("allows a signed-in free merchant to use pages and ordinary actions", async () => {
    expect(await requireUser(["owner"])).toBe(free);
    expect(await requireUserForAction(["owner"])).toBe(free);
    expect(() => requirePremium(free)).toThrow("Premium");
  });
  it("requires authentication and preserves role restrictions", async () => {
    await expect(requireUserForAction(["packer"])).rejects.toThrow("access");
    mock.getSession.mockResolvedValue(null);
    await expect(requireUser()).rejects.toThrow("redirect:/login");
    await expect(requireUserForAction()).rejects.toThrow("Not signed in");
  });
});
