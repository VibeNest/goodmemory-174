import { describe, expect, it } from "bun:test";
import {
  createMemorySource,
  transitionLifecycle,
} from "../../src/domain/provenance";

describe("provenance and lifecycle", () => {
  it("encodes explicit, inferred, import, and confirmed sources", () => {
    expect(
      createMemorySource({
        method: "explicit",
        extractedAt: "2026-01-01T00:00:00.000Z",
      }).method,
    ).toBe("explicit");
    expect(
      createMemorySource({
        method: "inferred",
        extractedAt: "2026-01-01T00:00:00.000Z",
      }).method,
    ).toBe("inferred");
    expect(
      createMemorySource({
        method: "import",
        extractedAt: "2026-01-01T00:00:00.000Z",
      }).method,
    ).toBe("import");
    expect(
      createMemorySource({
        method: "confirmed",
        extractedAt: "2026-01-01T00:00:00.000Z",
      }).method,
    ).toBe("confirmed");
  });

  it("supports lifecycle transitions", () => {
    expect(transitionLifecycle("active", "superseded")).toBe("superseded");
    expect(transitionLifecycle("active", "inactive")).toBe("inactive");
    expect(transitionLifecycle("inactive", "active")).toBe("active");
  });
});
