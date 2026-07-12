import { describe, expect, it } from "bun:test";

import {
  evaluatePhase71Gate,
  parsePhase71GateCliOptions,
  PHASE71_MAX_UNPACKED_BYTES,
  type Phase71BrowserEvidence,
  type Phase71StaticEvidence,
} from "../../scripts/run-phase-71-gate";

const browserEvidence: Phase71BrowserEvidence = {
  checks: {
    adminApiUsersScopes: true,
    auditLog: true,
    candidateApproveRejectRelease: true,
    cursorPagination: true,
    desktopNoOverlap: true,
    etagConflict: true,
    fragmentTokenCleared: true,
    idempotencyReplay: true,
    memoryCategorization: true,
    memoryDeleteConfirmation: true,
    memoryHistorySupersession: true,
    mobileNoOverlap: true,
    mutationErrorsVisible: true,
    normalConsoleClean: true,
    queryTokenRemoved: true,
    readOnlyMode: true,
    recallTrace: true,
    revisionFlow: true,
    scopeCountsRefresh: true,
    scopeDeleteConfirmation: true,
    temporaryArtifactsCleaned: true,
    tokenOnlyInAuthorization: true,
  },
  conflictProbe: {
    dialogStayedOpen: true,
    expectedConsoleNetworkErrors: 1,
    expectedHttpStatus: 412,
    messageVisible: true,
  },
  fixture: {
    command: "bun run scripts/run-phase-71-inspector-fixture.ts",
    llmCalls: 0,
    providerMode: "local injected adapters",
    storage: "temporary SQLite",
  },
  normalFlowConsole: { errors: 0, warnings: 0 },
  recordedAt: "2026-07-12T00:10:26Z",
  runId: "run-20260711-admin-inspector",
  runner: {
    browser: "Chromium 150",
    name: "@playwright/cli",
    version: "0.1.17",
  },
  schemaVersion: 1,
  viewports: [
    { height: 900, name: "desktop", width: 1440 },
    { height: 732, name: "mobile", width: 360 },
  ],
};

const staticEvidence: Phase71StaticEvidence = {
  adminApiVersioned: true,
  compressedWebAssets: true,
  duplicateViewerServerRemoved: true,
  privateReactWorkspace: true,
  queryPageBuiltIns: true,
  reactCursorPagination: true,
  runtimeViewerDelegated: true,
  scopeCatalogCoverage: true,
  tokenSecurity: true,
};

describe("Phase 71 Admin and Inspector gate", () => {
  it("passes complete browser, source, command, and package evidence", () => {
    expect(evaluatePhase71Gate({
      browserEvidence,
      commandExitCodes: [0, 0, 0],
      packageUnpackedBytes: PHASE71_MAX_UNPACKED_BYTES,
      staticEvidence,
    })).toMatchObject({ failures: [], status: "passed" });
  });

  it("fails closed on missing browser coverage or console errors", () => {
    const result = evaluatePhase71Gate({
      browserEvidence: {
        ...browserEvidence,
        checks: { ...browserEvidence.checks, revisionFlow: false },
        normalFlowConsole: { errors: 1, warnings: 0 },
      },
      commandExitCodes: [0, 0, 0],
      packageUnpackedBytes: PHASE71_MAX_UNPACKED_BYTES,
      staticEvidence,
    });

    expect(result.status).toBe("failed");
    expect(result.failures).toContain("browser check failed: revisionFlow");
    expect(result.failures).toContain("normal browser flow emitted console errors or warnings");
  });

  it("enforces the 4 MiB package target and static architecture checks", () => {
    const result = evaluatePhase71Gate({
      browserEvidence,
      commandExitCodes: [0, 1],
      packageUnpackedBytes: PHASE71_MAX_UNPACKED_BYTES + 1,
      staticEvidence: { ...staticEvidence, runtimeViewerDelegated: false },
    });

    expect(result.status).toBe("failed");
    expect(result.failures).toContain("packed package exceeds 4 MiB");
    expect(result.failures).toContain("static check failed: runtimeViewerDelegated");
    expect(result.failures).toContain("one or more gate commands failed");
  });

  it("parses canonical gate paths and skips", () => {
    expect(parsePhase71GateCliOptions([
      "bun",
      "run",
      "scripts/run-phase-71-gate.ts",
      "--browser-evidence",
      "/tmp/browser.json",
      "--output-dir",
      "/tmp/phase71",
      "--run-id",
      "run-test",
      "--skip-commands",
      "--skip-pack",
    ])).toEqual({
      browserEvidencePath: "/tmp/browser.json",
      outputDir: "/tmp/phase71",
      runId: "run-test",
      skipCommands: true,
      skipPack: true,
    });
  });
});
