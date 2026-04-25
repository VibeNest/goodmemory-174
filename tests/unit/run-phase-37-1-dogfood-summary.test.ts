import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parsePhase371DogfoodCliOptions,
  runPhase371DogfoodSummary,
  resolvePhase371DogfoodReportPath,
} from "../../scripts/run-phase-37-1-dogfood-summary";
import type { InstalledHostWritebackAuditLedger } from "../../src/install/hostWritebackAuditLedger";
import {
  markWritebackAuditCommitted,
  markWritebackAuditDismissed,
  markWritebackAuditForgotten,
  markWritebackAuditObserved,
  markWritebackAuditPending,
  markWritebackAuditRecalled,
  writeInstalledHostWritebackLedger,
} from "../../src/install/hostWritebackAuditLedger";

async function createHome(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

describe("run-phase-37-1 dogfood summary", () => {
  it("parses deterministic fixture mode for clean CI runners", () => {
    expect(
      parsePhase371DogfoodCliOptions([
        "bun",
        "run",
        "scripts/run-phase-37-1-dogfood-summary.ts",
        "--fixture",
        "accepted",
        "--min-sessions",
        "20",
      ]),
    ).toEqual({
      fixture: "accepted",
      homeRoot: undefined,
      minSessions: 20,
      outputDir: undefined,
      runId: undefined,
    });
  });

  it("can generate accepted deterministic dogfood evidence without local history", async () => {
    const outputDir = await createHome("goodmemory-phase371-dogfood-fixture-output-");

    try {
      const report = await runPhase371DogfoodSummary({
        fixture: "accepted",
        outputDir,
        runId: "run-dogfood-fixture-test",
      });

      expect(report.acceptance.decision).toBe("accepted");
      expect(report.evidenceSource).toBe("deterministic_fixture");
      expect(report.summary).toEqual(
        expect.objectContaining({
          candidateCount: 20,
          durableWriteCount: 20,
          forgottenCount: 1,
          nextSessionRecallHitCount: 8,
          sessionCount: 20,
        }),
      );
      expect(JSON.stringify(report)).not.toMatch(/transcript|messages|rawTranscript/u);
    } finally {
      await rm(outputDir, { force: true, recursive: true });
    }
  });

  it("summarizes local writeback audit events without transcript content", async () => {
    const homeRoot = await createHome("goodmemory-phase371-dogfood-home-");
    const outputDir = await createHome("goodmemory-phase371-dogfood-output-");

    try {
      let ledger: InstalledHostWritebackAuditLedger = {
        auditEvents: [],
        events: [],
        pending: [],
        version: 3,
      };
      for (let index = 1; index <= 20; index += 1) {
        ledger = markWritebackAuditPending(ledger, {
          candidateKey: `candidate:dogfood-${index}`,
          command: "session-end",
          content: `Next step is to inspect writeback audit event ${index}.`,
          eventId: `wb_dogfood_${index}`,
          host: "codex",
          kind: "fact",
          mode: "selective",
          now: `2026-04-24T00:${String(index).padStart(2, "0")}:00.000Z`,
          reason: "open_loop",
          scopeDigest: "scope:dogfood",
          sessionDigest: `session:write-${index}`,
          source: "user",
        });
        ledger = markWritebackAuditCommitted(ledger, {
          candidateKey: `candidate:dogfood-${index}`,
          eventId: `wb_dogfood_${index}`,
          linkedRecordIds: [
            {
              id: `fact-${index}`,
              type: "memory",
            },
          ],
          memoryIds: [`fact-${index}`],
          now: `2026-04-24T00:${String(index).padStart(2, "0")}:01.000Z`,
        });
      }
      ledger = markWritebackAuditRecalled(ledger, {
        eventId: "wb_dogfood_1",
        now: "2026-04-24T00:00:01.500Z",
        recallSessionDigest: "session:recall",
      });
      ledger = markWritebackAuditForgotten(ledger, {
        eventId: "wb_dogfood_1",
        forgottenLinkedRecordIds: [
          {
            id: "fact-1",
            type: "memory",
          },
        ],
        forgottenMemoryIds: ["fact-1"],
        now: "2026-04-24T00:00:02.000Z",
        review: {
          outcome: "false_write",
          reason: "Manual dogfood review.",
        },
      });
      ledger = markWritebackAuditDismissed(
        markWritebackAuditObserved(ledger, {
          candidateKey: "candidate:observe-only",
          command: "session-end",
          content: "Always keep this observe-only candidate out of durable metrics.",
          eventId: "wb_observe_only",
          host: "codex",
          kind: "preference",
          now: "2026-04-24T00:21:00.000Z",
          reason: "explicit_preference",
          scopeDigest: "scope:dogfood",
          sessionDigest: "session:observe-only",
          source: "user",
        }),
        {
          eventId: "wb_observe_only",
          now: "2026-04-24T00:21:01.000Z",
          review: {
            outcome: "false_write",
            reason: "Observe-only review should not affect durable false-write rate.",
          },
        },
      );
      await writeInstalledHostWritebackLedger("codex", homeRoot, ledger);

      const report = await runPhase371DogfoodSummary({
        homeRoot,
        outputDir,
        runId: "run-dogfood-test",
      });

      expect(report.acceptance.decision).toBe("accepted");
      expect(report.evidenceSource).toBe("local_audit_ledger");
      expect(report.generatedBy).toBe("scripts/run-phase-37-1-dogfood-summary.ts");
      expect(report.summary).toEqual(
        expect.objectContaining({
          candidateCount: 21,
          durableWriteCount: 20,
          falseWriteRateManual: 0.05,
          forgottenCount: 1,
          nextSessionRecallHitCount: 1,
          sessionCount: 21,
        }),
      );
      expect(JSON.stringify(report)).not.toMatch(/transcript|messages|rawTranscript/u);
      expect(resolvePhase371DogfoodReportPath(outputDir, "run-dogfood-test")).toBe(
        join(outputDir, "run-dogfood-test", "report.json"),
      );
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(outputDir, { force: true, recursive: true });
    }
  });

  it("blocks dogfood reports that have sessions but no durable writes or recall hits", async () => {
    const homeRoot = await createHome("goodmemory-phase371-dogfood-blocked-home-");
    const outputDir = await createHome("goodmemory-phase371-dogfood-blocked-output-");

    try {
      let ledger: InstalledHostWritebackAuditLedger = {
        auditEvents: [],
        events: [],
        pending: [],
        version: 3,
      };
      for (let index = 1; index <= 20; index += 1) {
        ledger = markWritebackAuditPending(ledger, {
          candidateKey: `candidate:pending-${index}`,
          command: "session-end",
          content: `Next step is pending event ${index}.`,
          eventId: `wb_pending_${index}`,
          host: "codex",
          kind: "fact",
          mode: "selective",
          now: `2026-04-24T01:${String(index).padStart(2, "0")}:00.000Z`,
          reason: "open_loop",
          scopeDigest: "scope:dogfood",
          sessionDigest: `session:pending-${index}`,
          source: "user",
        });
      }
      await writeInstalledHostWritebackLedger("codex", homeRoot, ledger);

      const report = await runPhase371DogfoodSummary({
        homeRoot,
        outputDir,
        runId: "run-dogfood-blocked-test",
      });

      expect(report.acceptance.decision).toBe("blocked");
      expect(report.summary).toEqual(
        expect.objectContaining({
          candidateCount: 20,
          durableWriteCount: 0,
          nextSessionRecallHitCount: 0,
          sessionCount: 20,
        }),
      );
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(outputDir, { force: true, recursive: true });
    }
  });
});
