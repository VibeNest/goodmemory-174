import { describe, expect, it } from "bun:test";
import { isSameScope, normalizeScope, scopeToKey } from "../../src/domain/scope";

describe("domain scope", () => {
  it("requires a non-empty userId", () => {
    expect(() => normalizeScope({ userId: "" })).toThrow("userId");
  });

  it("normalizes optional blank fields to undefined", () => {
    const scope = normalizeScope({
      userId: "u-1",
      tenantId: "",
      workspaceId: "ws-1",
      agentId: "",
      sessionId: "s-1",
    });

    expect(scope).toEqual({
      userId: "u-1",
      workspaceId: "ws-1",
      sessionId: "s-1",
    });
  });

  it("creates a deterministic scope key and equality check", () => {
    const a = normalizeScope({
      userId: "u-1",
      workspaceId: "ws-1",
      sessionId: "s-1",
    });
    const b = normalizeScope({
      userId: "u-1",
      workspaceId: "ws-1",
      sessionId: "s-1",
    });

    expect(scopeToKey(a)).toBe(scopeToKey(b));
    expect(isSameScope(a, b)).toBe(true);
  });
});
