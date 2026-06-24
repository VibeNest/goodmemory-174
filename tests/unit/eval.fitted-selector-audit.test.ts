import { describe, expect, it } from "bun:test";
import {
  analyzeSelectorFitting,
  type SelectorSourceEntry,
} from "../../src/eval/fittedSelectorAudit";

describe("analyzeSelectorFitting", () => {
  const entries: SelectorSourceEntry[] = [
    {
      path: "patentFunding.ts",
      source:
        'if (content.includes("Brunhilde Vasquez") || content.includes("Hawthorne Prize")) { return true; }',
    },
    {
      path: "general.ts",
      source:
        'const score = factIntentPriority; const phrase = "the project status update";',
    },
    {
      path: "mixed.ts",
      source: 'const day = "Friday"; const name = "Tobias";',
    },
    {
      path: "imports.ts",
      source: 'import { foo } from "./bar"; const code = "lowercase only";',
    },
  ];

  it("flags string literals with proper-noun tokens and ignores general code", () => {
    const report = analyzeSelectorFitting(entries);
    expect(report.totalFiles).toBe(4);
    expect(report.fittedFiles).toBe(2);
    expect(report.totalProperNounLiterals).toBe(3);

    expect(report.findings[0]?.path).toBe("patentFunding.ts");
    expect(report.findings[0]?.properNounLiterals).toHaveLength(2);
    expect(report.findings[0]?.properNounLiterals).toContain("Brunhilde Vasquez");

    expect(report.findings[1]?.path).toBe("mixed.ts");
    expect(report.findings[1]?.properNounLiterals).toEqual(["Tobias"]);

    const fittedPaths = report.findings.map((finding) => finding.path);
    expect(fittedPaths).not.toContain("general.ts");
    expect(fittedPaths).not.toContain("imports.ts");
  });

  it("does not flag allowlisted capitalized words (e.g. weekdays, formats)", () => {
    const report = analyzeSelectorFitting([
      { path: "temporal.ts", source: 'const d = "Friday"; const f = "JSON";' },
    ]);
    expect(report.fittedFiles).toBe(0);
  });

  it("honors a caller-supplied allowlist", () => {
    const report = analyzeSelectorFitting(
      [{ path: "p.ts", source: 'const owner = "Tobias is the owner";' }],
      { allowlist: ["Tobias"] },
    );
    expect(report.fittedFiles).toBe(0);
  });
});
