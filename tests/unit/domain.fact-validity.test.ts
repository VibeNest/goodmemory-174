import { describe, expect, it } from "bun:test";
import { isFactExpired } from "../../src/domain/records";

describe("isFactExpired", () => {
  const now = "2026-06-24T00:00:00.000Z";

  it("expires when expiresAt is at or before the reference time", () => {
    expect(isFactExpired({ expiresAt: "2026-06-23T00:00:00.000Z" }, now)).toBe(
      true,
    );
    expect(isFactExpired({ expiresAt: now }, now)).toBe(true);
  });

  it("expires when the validity window (validUntil) has closed", () => {
    expect(isFactExpired({ validUntil: "2026-01-01T00:00:00.000Z" }, now)).toBe(
      true,
    );
  });

  it("does not expire for future boundaries or no boundary", () => {
    expect(isFactExpired({ expiresAt: "2027-01-01T00:00:00.000Z" }, now)).toBe(
      false,
    );
    expect(isFactExpired({ validUntil: "2027-01-01T00:00:00.000Z" }, now)).toBe(
      false,
    );
    expect(isFactExpired({}, now)).toBe(false);
  });

  it("treats unparseable dates as non-expiring (safe default)", () => {
    expect(isFactExpired({ expiresAt: "not-a-date" }, now)).toBe(false);
    expect(isFactExpired({ expiresAt: "2020-01-01T00:00:00.000Z" }, "nope")).toBe(
      false,
    );
  });
});
