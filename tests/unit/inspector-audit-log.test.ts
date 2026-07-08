import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendInspectorAuditEvent,
  readInspectorAuditLedger,
} from "../../src/inspector/auditLog";

let dirs: string[] = [];

async function tempHome(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "gm-inspector-audit-"));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  dirs = [];
});

describe("inspector audit ledger", () => {
  it("appends events in order and reads them back", async () => {
    const home = await tempHome();

    await appendInspectorAuditEvent({
      homeRoot: home,
      event: {
        actionId: "insp_1",
        action: "forget",
        occurredAt: "2026-07-07T00:00:00.000Z",
        scopeDigest: "scope:abc",
        targetId: "mem-1",
        resultStatus: "ok",
      },
    });
    await appendInspectorAuditEvent({
      homeRoot: home,
      event: {
        actionId: "insp_2",
        action: "approve",
        occurredAt: "2026-07-07T00:01:00.000Z",
        scopeDigest: "scope:abc",
        targetId: "cand-1",
        resultStatus: "ok",
        resultMemoryIds: ["mem-9"],
      },
    });

    const ledger = await readInspectorAuditLedger(home);
    expect(ledger.events.map((event) => event.actionId)).toEqual(["insp_1", "insp_2"]);
    expect(ledger.events[1]?.resultMemoryIds).toEqual(["mem-9"]);
  });

  it("redacts secret-like previews and clamps long ones as a backstop", async () => {
    const home = await tempHome();

    await appendInspectorAuditEvent({
      homeRoot: home,
      event: {
        actionId: "insp_secret",
        action: "revise",
        occurredAt: "2026-07-07T00:00:00.000Z",
        scopeDigest: "scope:x",
        resultStatus: "ok",
        contentPreview: "password: hunter2-do-not-store",
      },
    });
    await appendInspectorAuditEvent({
      homeRoot: home,
      event: {
        actionId: "insp_long",
        action: "revise",
        occurredAt: "2026-07-07T00:01:00.000Z",
        scopeDigest: "scope:x",
        resultStatus: "ok",
        contentPreview: "x".repeat(400),
      },
    });

    const ledger = await readInspectorAuditLedger(home);
    expect(ledger.events[0]?.contentPreview).toBe("[redacted secret-like content]");
    const clamped = ledger.events[1]?.contentPreview ?? "";
    expect(clamped.length).toBeLessThanOrEqual(160);
    expect(clamped.endsWith("...")).toBe(true);
  });

  it("returns an empty ledger when no file exists yet", async () => {
    const home = await tempHome();
    const ledger = await readInspectorAuditLedger(home);
    expect(ledger.events).toEqual([]);
    expect(ledger.version).toBe(1);
  });
});
