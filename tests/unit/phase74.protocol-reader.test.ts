import { describe, expect, it } from "bun:test";

import {
  buildPhase74ProtocolReaderContext,
  createPhase74ProtocolReader,
  PHASE74_PROTOCOL_READER_SYSTEM_PROMPT,
} from "../../src/eval/phase74ProtocolReader";
import type { OracleMatrixReaderInput } from "../../src/eval/oracleMatrix";

describe("Phase 74 eval-only protocol reader", () => {
  it("uses protocol metadata to build a source-ordered operation evidence pack", () => {
    const context = buildPhase74ProtocolReaderContext({
      context: "raw context must not be the only protocol input",
      contextItems: [
        {
          content: "SQLite was used first.",
          id: "memory-1",
          observedAt: "2026-01-01T00:00:00.000Z",
          role: "user",
          sourceIds: ["source-1"],
        },
        {
          content: "Postgres is current.",
          id: "memory-2",
          observedAt: "2026-02-01T00:00:00.000Z",
          role: "user",
          sourceIds: ["source-2"],
        },
      ],
      protocolMetadata: { questionType: "knowledge_update" },
      question: "Which database is current?",
    });

    expect(context).toContain(PHASE74_PROTOCOL_READER_SYSTEM_PROMPT);
    expect(context).toContain("Current-value resolution");
    const sourceOrderedEvidence = context.slice(
      context.indexOf("Evidence (source-ordered, earliest first):"),
    );
    expect(sourceOrderedEvidence.indexOf("SQLite was used first.")).toBeLessThan(
      sourceOrderedEvidence.indexOf("Postgres is current."),
    );
  });

  it("maps an adversarial abstention protocol to the abstention operation", () => {
    const context = buildPhase74ProtocolReaderContext({
      context: "",
      contextItems: [{
        content: "Adjacent fact only.",
        id: "memory-1",
        sourceIds: ["source-1"],
      }],
      protocolMetadata: { matchMode: "adversarial_abstention" },
      question: "What unsupported detail was requested?",
    });

    expect(context).toContain("Abstention calibration");
  });

  it("adapts a generic model call into an independently attributed budgeted protocol reader", async () => {
    const delegated: OracleMatrixReaderInput[] = [];
    const protocolReader = createPhase74ProtocolReader({
      contextTokenBudget: 240,
      countRenderedTokens: (context) => context.length,
      reader: async (input) => {
        delegated.push(input);
        return "Postgres";
      },
    });

    const answer = await protocolReader({
      caseId: "case-1",
      context: "unshaped",
      contextItems: [{
        content: "Postgres is current. ".repeat(100),
        id: "memory-1",
        sourceIds: ["source-1"],
      }],
      purpose: "oracle:retrieved-full+protocol-reader",
      protocolMetadata: { questionType: "knowledge_update" },
      question: "Which database is current?",
    });

    expect(answer).toBe("Postgres");
    expect(delegated).toHaveLength(1);
    expect(delegated[0]?.purpose).toBe(
      "protocol:oracle:retrieved-full+protocol-reader",
    );
    expect(delegated[0]!.context.length).toBeLessThanOrEqual(240);
    expect(delegated[0]?.context).not.toBe("unshaped");
  });
});
