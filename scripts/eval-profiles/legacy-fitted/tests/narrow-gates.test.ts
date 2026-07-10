import { afterEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
  beginNarrowGateHitAuditForInternalEval,
  __enableLegacyFittedNarrowGatesForTest,
  endNarrowGateHitAuditForInternalEval,
  listRegisteredNarrowGateIds,
  narrowGate,
  probeNarrowGatesForInternalEval,
  readNarrowGateHitAuditForInternalEval,
  setNarrowGateAuditCaseForInternalEval,
} from "../recall/narrowGates";
import { isSleekNeutralSneakerPreferenceQuery } from "../recall/selectors/sourceOrderRules/preferenceRules";
import {
  FACT_SELECTION_ROUTE_TABLE,
  PRIMARY_FACT_SELECTION_ORDER,
} from "../recall/factSelection/routeTable";
// Side-effect import: loads the full selection module graph so every wrapped
// narrow gate registers before the census assertions run.
import "../recall/selectionLegacy";

const SNEAKER_QUERY =
  "Can you suggest sneakers I might like to buy as a new pair? Please recommend options I might like.";

describe("narrow gate registry", () => {
  afterEach(() => {
    endNarrowGateHitAuditForInternalEval();
    __enableLegacyFittedNarrowGatesForTest();
  });

  it("keeps fitted gates disabled by default", async () => {
    const child = Bun.spawn(
      [
        "bun",
        "-e",
        'const { narrowGate } = await import("./scripts/eval-profiles/legacy-fitted/recall/narrowGates.ts"); console.log(narrowGate("test.productionDefault", () => true)());',
      ],
      { cwd: join(import.meta.dir, "../../../.."), stderr: "pipe", stdout: "pipe" },
    );

    expect(await child.exited).toBe(0);
    expect((await new Response(child.stdout).text()).trim()).toBe("false");
  });

  it("allows the repo-only legacy eval profile to enable fitted gates", () => {
    __enableLegacyFittedNarrowGatesForTest();

    expect(isSleekNeutralSneakerPreferenceQuery(SNEAKER_QUERY)).toBe(true);
    expect(isSleekNeutralSneakerPreferenceQuery("unrelated question")).toBe(false);
  });

  it("forces a disabled legacy gate to false", async () => {
    const child = Bun.spawn(
      [
        "bun",
        "-e",
        [
          'const gates = await import("./scripts/eval-profiles/legacy-fitted/recall/narrowGates.ts");',
          'const rules = await import("./scripts/eval-profiles/legacy-fitted/recall/selectors/sourceOrderRules/preferenceRules.ts");',
          "gates.enableLegacyFittedNarrowGatesForInternalEval();",
          'process.env.GOODMEMORY_DISABLED_NARROW_GATES = "preference.sleekNeutralSneaker";',
          "gates.__resetNarrowGateDisablesForTest();",
          `console.log(rules.isSleekNeutralSneakerPreferenceQuery(${JSON.stringify(SNEAKER_QUERY)}));`,
        ].join(" "),
      ],
      { cwd: join(import.meta.dir, "../../../.."), stderr: "pipe", stdout: "pipe" },
    );

    expect(await child.exited).toBe(0);
    expect((await new Response(child.stdout).text()).trim()).toBe("false");
  });

  it("registers unique well-formed ids", () => {
    const ids = listRegisteredNarrowGateIds();

    expect(ids.length).toBeGreaterThanOrEqual(50);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z][a-zA-Z0-9]*\.[a-zA-Z0-9]+$/);
    }
  });

  it("records true gate hits once per eval case", () => {
    __enableLegacyFittedNarrowGatesForTest();
    const gate = narrowGate("test.hitAuditProbe", (value: string) =>
      value === "match"
    );
    beginNarrowGateHitAuditForInternalEval();

    setNarrowGateAuditCaseForInternalEval("case-a");
    expect(gate("match")).toBe(true);
    expect(gate("match")).toBe(true);
    setNarrowGateAuditCaseForInternalEval("case-b");
    expect(gate("miss")).toBe(false);

    expect(readNarrowGateHitAuditForInternalEval()).toContainEqual({
      caseIds: ["case-a"],
      gateId: "test.hitAuditProbe",
    });
  });

  it("probes registered query classifiers without running recall", () => {
    narrowGate("test.directProbe", (query: string) => query === "direct-hit");

    expect(probeNarrowGatesForInternalEval("direct-hit")).toContain(
      "test.directProbe",
    );
    expect(probeNarrowGatesForInternalEval("miss")).not.toContain(
      "test.directProbe",
    );
  });

  it("rejects malformed and duplicate ids", () => {
    expect(() => narrowGate("BadId", () => true)).toThrow(
      /must match <family>\.<name>/,
    );

    const probeId = "test.duplicateProbe";
    narrowGate(probeId, () => true);
    expect(() => narrowGate(probeId, () => true)).toThrow(/registered twice/);
  });
});

describe("legacy fitted route table", () => {
  it("stays aligned with the historical primary selection order", () => {
    expect(FACT_SELECTION_ROUTE_TABLE.map((route) => route.id)).toEqual([
      ...PRIMARY_FACT_SELECTION_ORDER,
    ]);
  });
});
