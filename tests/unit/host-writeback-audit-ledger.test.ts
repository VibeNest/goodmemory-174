import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildWritebackAuditEventId,
  markWritebackAuditCommitted,
  markWritebackAuditDismissed,
  markWritebackAuditFailed,
  markWritebackAuditForgetFailed,
  markWritebackAuditForgotten,
  markWritebackAuditObserved,
  markWritebackAuditPending,
  markWritebackAuditRecalled,
  readInstalledHostWritebackLedger,
  withInstalledHostWritebackLedgerLock,
  writeInstalledHostWritebackLedger,
} from "../../src/install/hostWritebackAuditLedger";

async function createHome(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

function expectNoForbiddenAuditKeys(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      expectNoForbiddenAuditKeys(item);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    expect(["transcript", "messages", "rawTranscript", "rawContent"]).not.toContain(key);
    expectNoForbiddenAuditKeys(nested);
  }
}

describe("installed host writeback audit ledger", () => {
  it("reads legacy phase-37 ledgers without losing dedupe keys", async () => {
    const homeRoot = await createHome("goodmemory-writeback-legacy-ledger-");

    try {
      await mkdir(join(homeRoot, ".goodmemory"), { recursive: true });
      await writeFile(
        join(homeRoot, ".goodmemory/codex-writeback-events.json"),
        JSON.stringify(
          {
            events: ["candidate:committed"],
            pending: ["candidate:pending"],
            version: 2,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );

      const ledger = await readInstalledHostWritebackLedger("codex", homeRoot);

      expect(ledger.events).toEqual(["candidate:committed"]);
      expect(ledger.pending).toEqual(["candidate:pending"]);
      expect(ledger.auditEvents).toEqual([]);
      expect(ledger.version).toBe(4);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
    }
  });

  it("records committed audit events without raw transcript, full assistant output, or secrets", async () => {
    const homeRoot = await createHome("goodmemory-writeback-audit-ledger-");
    const eventId = buildWritebackAuditEventId({
      candidateKey: "candidate:abc123",
      scopeDigest: "scope:demo",
    });

    try {
      let ledger = await readInstalledHostWritebackLedger("codex", homeRoot);
      ledger = markWritebackAuditPending(ledger, {
        candidateKey: "candidate:abc123",
        command: "session-end",
        content:
          "assistant: Always run typecheck before closing Phase 37. Full transcript text must not be stored here. api_key=sk-test-secret-value",
        eventId,
        host: "codex",
        kind: "preference",
        mode: "selective",
        now: "2026-04-24T00:00:00.000Z",
        reason: "explicit_preference",
        scopeDigest: "scope:demo",
        sessionDigest: "session:demo",
        source: "user",
      });
      ledger = markWritebackAuditCommitted(ledger, {
        candidateKey: "candidate:abc123",
        eventId,
        linkedRecordIds: [
          {
            id: "preference-1",
            type: "memory",
          },
          {
            id: "evidence-1",
            type: "evidence",
          },
          {
            id: "experience-1",
            type: "experience",
          },
        ],
        memoryIds: ["preference-1"],
        now: "2026-04-24T00:00:01.000Z",
      });
      await writeInstalledHostWritebackLedger("codex", homeRoot, ledger);

      const written = JSON.parse(
        await readFile(
          join(homeRoot, ".goodmemory/codex-writeback-events.json"),
          "utf8",
        ),
      ) as Record<string, unknown>;
      const roundTrip = await readInstalledHostWritebackLedger("codex", homeRoot);

      expect(written).not.toHaveProperty("transcript");
      expect(written).not.toHaveProperty("messages");
      expectNoForbiddenAuditKeys(written);
      expect(JSON.stringify(written)).not.toContain("sk-test-secret-value");
      expect(JSON.stringify(written)).not.toContain("Full transcript text must not be stored here");
      expect(roundTrip.events).toContain("candidate:abc123");
      expect(roundTrip.pending).not.toContain("candidate:abc123");
      expect(roundTrip.auditEvents).toEqual([
        expect.objectContaining({
          candidateKey: "candidate:abc123",
          eventId,
          linkedRecordIds: expect.arrayContaining([
            expect.objectContaining({
              id: "preference-1",
              type: "memory",
            }),
            expect.objectContaining({
              id: "evidence-1",
              type: "evidence",
            }),
            expect.objectContaining({
              id: "experience-1",
              type: "experience",
            }),
          ]),
          memoryIds: ["preference-1"],
          sessionDigest: expect.stringMatching(/^session:/u),
          status: "committed",
        }),
      ]);
      expect(roundTrip.auditEvents[0]?.contentPreview.length).toBeLessThanOrEqual(160);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
    }
  });

  it("redacts unsafe audit reasons before persistence", () => {
    const eventId = buildWritebackAuditEventId({
      candidateKey: "candidate:unsafe-reason",
      scopeDigest: "scope:demo",
    });
    const ledger = markWritebackAuditPending(
      {
        auditEvents: [],
        events: [],
        pending: [],
        version: 3,
      },
      {
        candidateKey: "candidate:unsafe-reason",
        command: "session-end",
        content: "Next step is safe enough to preview.",
        eventId,
        host: "codex",
        kind: "fact",
        mode: "selective",
        now: "2026-04-24T00:00:00.000Z",
        reason: "summary_reason: api_key=sk-reason-secret-value",
        scopeDigest: "scope:demo",
        source: "user",
      },
    );

    expect(ledger.auditEvents[0]?.reason).toBe("[redacted secret-like content]");
    expect(JSON.stringify(ledger)).not.toContain("sk-reason-secret-value");
  });

  it("records observed audit events without touching committed or pending dedupe keys", async () => {
    const homeRoot = await createHome("goodmemory-writeback-observed-ledger-");
    const eventId = buildWritebackAuditEventId({
      candidateKey: "scope:demo:candidate:observe",
      scopeDigest: "scope:demo",
    });

    try {
      const ledger = markWritebackAuditObserved(
        {
          auditEvents: [],
          events: [],
          pending: [],
          version: 4,
        },
        {
          candidateKey: "scope:demo:candidate:observe",
          command: "session-end",
          content:
            "Always run typecheck before closing Phase 37. api_key=sk-observed-secret-value",
          eventId,
          host: "codex",
          kind: "preference",
          now: "2026-04-24T00:00:00.000Z",
          reason: "explicit_preference",
          scopeDigest: "scope:demo",
          sessionDigest: "session:observe",
          source: "user",
        },
      );
      await writeInstalledHostWritebackLedger("codex", homeRoot, ledger);

      const roundTrip = await readInstalledHostWritebackLedger("codex", homeRoot);

      expect(roundTrip.events).toEqual([]);
      expect(roundTrip.pending).toEqual([]);
      expect(JSON.stringify(roundTrip)).not.toContain("sk-observed-secret-value");
      expect(roundTrip.auditEvents[0]).toEqual(
        expect.objectContaining({
          candidateKey: "scope:demo:candidate:observe",
          eventId,
          mode: "observe",
          sessionDigest: expect.stringMatching(/^session:/u),
          status: "observed",
        }),
      );
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
    }
  });

  it("lets dismissed observed events transition to pending without committed dedupe", () => {
    const eventId = buildWritebackAuditEventId({
      candidateKey: "scope:demo:candidate:observe",
      scopeDigest: "scope:demo",
    });
    const dismissed = markWritebackAuditDismissed(
      markWritebackAuditObserved(
        {
          auditEvents: [],
          events: [],
          pending: [],
          version: 4,
        },
        {
          candidateKey: "scope:demo:candidate:observe",
          command: "session-end",
          content: "Always run typecheck before closing Phase 37.",
          eventId,
          host: "codex",
          kind: "preference",
          now: "2026-04-24T00:00:00.000Z",
          reason: "explicit_preference",
          scopeDigest: "scope:demo",
          source: "user",
        },
      ),
      {
        eventId,
        now: "2026-04-24T00:00:01.000Z",
        review: {
          outcome: "false_write",
          reason: "not worth keeping",
        },
      },
    );
    const pending = markWritebackAuditPending(dismissed, {
      candidateKey: "scope:demo:candidate:observe",
      command: "session-end",
      content: "Always run typecheck before closing Phase 37.",
      eventId,
      host: "codex",
      kind: "preference",
      mode: "selective",
      now: "2026-04-24T00:00:02.000Z",
      reason: "explicit_preference",
      scopeDigest: "scope:demo",
      source: "user",
    });

    expect(dismissed.events).toEqual([]);
    expect(dismissed.pending).toEqual([]);
    expect(dismissed.auditEvents[0]).toEqual(
      expect.objectContaining({
        review: {
          outcome: "false_write",
          reason: "not worth keeping",
        },
        status: "dismissed",
      }),
    );
    expect(pending.events).toEqual([]);
    expect(pending.pending).toEqual(["scope:demo:candidate:observe"]);
    expect(pending.auditEvents[0]).toEqual(
      expect.objectContaining({
        mode: "selective",
        status: "pending",
      }),
    );
    expect(pending.auditEvents[0]?.review).toBeUndefined();
  });

  it("acquires the ledger lock on a fresh home", async () => {
    const homeRoot = await createHome("goodmemory-writeback-fresh-lock-");

    try {
      const result = await withInstalledHostWritebackLedgerLock(
        "codex",
        homeRoot,
        async () => "locked",
      );

      expect(result).toBe("locked");
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
    }
  });

  it("marks forgotten events while preserving the dedupe key", async () => {
    const eventId = buildWritebackAuditEventId({
      candidateKey: "candidate:abc123",
      scopeDigest: "scope:demo",
    });
    const ledger = markWritebackAuditForgotten(
      markWritebackAuditCommitted(
        markWritebackAuditPending(
          {
            auditEvents: [],
            events: [],
            pending: [],
            version: 3,
          },
          {
            candidateKey: "candidate:abc123",
            command: "session-end",
            content: "Next step is to add audit undo.",
            eventId,
            host: "codex",
            kind: "fact",
            mode: "selective",
            now: "2026-04-24T00:00:00.000Z",
            reason: "open_loop",
            scopeDigest: "scope:demo",
            sessionDigest: "session:demo",
            source: "user",
          },
        ),
        {
          candidateKey: "candidate:abc123",
          eventId,
          linkedRecordIds: [
            {
              id: "fact-1",
              type: "memory",
            },
          ],
          memoryIds: ["fact-1"],
          now: "2026-04-24T00:00:01.000Z",
        },
      ),
      {
        eventId,
        forgottenLinkedRecordIds: [
          {
            id: "fact-1",
            type: "memory",
          },
        ],
        forgottenMemoryIds: ["fact-1"],
        review: {
          outcome: "false_write",
          reason: "api_key=sk-review-secret-value",
        },
        now: "2026-04-24T00:00:02.000Z",
      },
    );

    expect(ledger.events).toContain("candidate:abc123");
    expect(ledger.auditEvents[0]).toMatchObject({
      forgottenMemoryIds: ["fact-1"],
      forgottenLinkedRecordIds: [
        {
          id: "fact-1",
          type: "memory",
        },
      ],
      memoryIds: ["fact-1"],
      review: {
        outcome: "false_write",
        reason: "[redacted secret-like content]",
      },
      linkedRecordIds: [
        {
          forgottenAt: "2026-04-24T00:00:02.000Z",
          id: "fact-1",
          type: "memory",
        },
      ],
      status: "forgotten",
    });
    expect(JSON.stringify(ledger)).not.toContain("sk-review-secret-value");
  });

  it("clears stale error codes on successful commit and forget transitions", () => {
    const eventId = buildWritebackAuditEventId({
      candidateKey: "candidate:abc123",
      scopeDigest: "scope:demo",
    });
    const pending = markWritebackAuditPending(
      {
        auditEvents: [],
        events: [],
        pending: [],
        version: 3,
      },
      {
        candidateKey: "candidate:abc123",
        command: "session-end",
        content: "Next step is to clear stale audit errors.",
        eventId,
        host: "codex",
        kind: "fact",
        mode: "selective",
        now: "2026-04-24T00:00:00.000Z",
        reason: "open_loop",
        scopeDigest: "scope:demo",
        source: "user",
      },
    );
    const committedAfterFailure = markWritebackAuditCommitted(
      markWritebackAuditFailed(pending, {
        candidateKey: "candidate:abc123",
        errorCode: "remember_failed",
        eventId,
        now: "2026-04-24T00:00:01.000Z",
      }),
      {
        candidateKey: "candidate:abc123",
        eventId,
        linkedRecordIds: [
          {
            id: "fact-1",
            type: "memory",
          },
        ],
        memoryIds: ["fact-1"],
        now: "2026-04-24T00:00:02.000Z",
      },
    );
    const failedForget = markWritebackAuditForgetFailed(committedAfterFailure, {
      eventId,
      forgottenLinkedRecordIds: [
        {
          id: "fact-1",
          type: "memory",
        },
      ],
      now: "2026-04-24T00:00:03.000Z",
    });
    const forgottenAfterRetry = markWritebackAuditForgotten(failedForget, {
      eventId,
      forgottenLinkedRecordIds: [
        {
          id: "fact-1",
          type: "memory",
        },
      ],
      forgottenMemoryIds: ["fact-1"],
      now: "2026-04-24T00:00:04.000Z",
    });

    expect(committedAfterFailure.auditEvents[0]?.errorCode).toBeUndefined();
    expect(failedForget.auditEvents[0]?.errorCode).toBe("forget_failed");
    expect(forgottenAfterRetry.auditEvents[0]?.errorCode).toBeUndefined();
    expect(forgottenAfterRetry.auditEvents[0]?.status).toBe("forgotten");
  });

  it("does not downgrade committed events back to pending on retry", () => {
    const eventId = buildWritebackAuditEventId({
      candidateKey: "candidate:abc123",
      scopeDigest: "scope:demo",
    });
    const committed = markWritebackAuditCommitted(
      markWritebackAuditPending(
        {
          auditEvents: [],
          events: [],
          pending: [],
          version: 3,
        },
        {
          candidateKey: "candidate:abc123",
          command: "session-end",
          content: "Next step is to add audit undo.",
          eventId,
          host: "codex",
          kind: "fact",
          mode: "selective",
          now: "2026-04-24T00:00:00.000Z",
          reason: "open_loop",
          scopeDigest: "scope:demo",
          source: "user",
        },
      ),
      {
        candidateKey: "candidate:abc123",
        eventId,
        memoryIds: ["fact-1"],
        now: "2026-04-24T00:00:01.000Z",
      },
    );

    const retried = markWritebackAuditPending(committed, {
      candidateKey: "candidate:abc123",
      command: "session-end",
      content: "Next step is to add audit undo.",
      eventId,
      host: "codex",
      kind: "fact",
      mode: "selective",
      now: "2026-04-24T00:00:02.000Z",
      reason: "open_loop",
      scopeDigest: "scope:demo",
      source: "user",
    });

    expect(retried.events).toContain("candidate:abc123");
    expect(retried.pending).not.toContain("candidate:abc123");
    expect(retried.auditEvents[0]?.status).toBe("committed");
  });

  it("redacts assistant-originated audit previews instead of storing raw output", () => {
    const eventId = buildWritebackAuditEventId({
      candidateKey: "candidate:assistant",
      scopeDigest: "scope:demo",
    });
    const ledger = markWritebackAuditPending(
      {
        auditEvents: [],
        events: [],
        pending: [],
        version: 3,
      },
      {
        candidateKey: "candidate:assistant",
        command: "session-end",
        content: "UNIQUE_RAW_ASSISTANT_OUTPUT should not be persisted.",
        eventId,
        host: "codex",
        kind: "fact",
        mode: "selective",
        now: "2026-04-24T00:00:00.000Z",
        reason: "host_annotation",
        scopeDigest: "scope:demo",
        source: "assistant",
      },
    );

    expect(JSON.stringify(ledger)).not.toContain("UNIQUE_RAW_ASSISTANT_OUTPUT");
    expect(ledger.auditEvents[0]?.contentPreview).toBe(
      "[redacted assistant-originated candidate]",
    );
  });

  it("records failed audit events without committing or leaving pending dedupe keys", () => {
    const eventId = buildWritebackAuditEventId({
      candidateKey: "candidate:abc123",
      scopeDigest: "scope:demo",
    });
    const ledger = markWritebackAuditFailed(
      markWritebackAuditPending(
        {
          auditEvents: [],
          events: [],
          pending: [],
          version: 3,
        },
        {
          candidateKey: "candidate:abc123",
          command: "session-end",
          content: "Next step is to record failed audit events.",
          eventId,
          host: "codex",
          kind: "fact",
          mode: "selective",
          now: "2026-04-24T00:00:00.000Z",
          reason: "open_loop",
          scopeDigest: "scope:demo",
          sessionDigest: "session:demo",
          source: "user",
        },
      ),
      {
        candidateKey: "candidate:abc123",
        errorCode: "remember_failed",
        eventId,
        now: "2026-04-24T00:00:01.000Z",
      },
    );

    expect(ledger.events).not.toContain("candidate:abc123");
    expect(ledger.pending).not.toContain("candidate:abc123");
    expect(ledger.auditEvents[0]).toEqual(
      expect.objectContaining({
        errorCode: "remember_failed",
        status: "failed",
      }),
    );
  });

  it("records explicit next-session recall hits for dogfood metrics", () => {
    const eventId = buildWritebackAuditEventId({
      candidateKey: "candidate:abc123",
      scopeDigest: "scope:demo",
    });
    const ledger = markWritebackAuditRecalled(
      markWritebackAuditCommitted(
        markWritebackAuditPending(
          {
            auditEvents: [],
            events: [],
            pending: [],
            version: 3,
          },
          {
            candidateKey: "candidate:abc123",
            command: "session-end",
            content: "Next step is to confirm recall audit metrics.",
            eventId,
            host: "codex",
            kind: "fact",
            mode: "selective",
            now: "2026-04-24T00:00:00.000Z",
            reason: "open_loop",
            scopeDigest: "scope:demo",
            sessionDigest: "session:write",
            source: "user",
          },
        ),
        {
          candidateKey: "candidate:abc123",
          eventId,
          linkedRecordIds: [
            {
              id: "fact-1",
              type: "memory",
            },
          ],
          memoryIds: ["fact-1"],
          now: "2026-04-24T00:00:01.000Z",
        },
      ),
      {
        eventId,
        now: "2026-04-24T00:00:02.000Z",
        recallSessionDigest: "session:recall",
      },
    );

    expect(ledger.auditEvents[0]).toEqual(
      expect.objectContaining({
        recallHitCount: 1,
        recalledBy: [
          {
            occurredAt: "2026-04-24T00:00:02.000Z",
            sessionDigest: expect.stringMatching(/^session:/u),
          },
        ],
      }),
    );
  });

  it("counts a recalled writeback event once per recall session", () => {
    const eventId = buildWritebackAuditEventId({
      candidateKey: "candidate:abc123",
      scopeDigest: "scope:demo",
    });
    const committed = markWritebackAuditCommitted(
      markWritebackAuditPending(
        {
          auditEvents: [],
          events: [],
          pending: [],
          version: 3,
        },
        {
          candidateKey: "candidate:abc123",
          command: "session-end",
          content: "Next step is to confirm recall audit metrics.",
          eventId,
          host: "codex",
          kind: "fact",
          mode: "selective",
          now: "2026-04-24T00:00:00.000Z",
          reason: "open_loop",
          scopeDigest: "scope:demo",
          sessionDigest: "session:write",
          source: "user",
        },
      ),
      {
        candidateKey: "candidate:abc123",
        eventId,
        linkedRecordIds: [
          {
            id: "fact-1",
            type: "memory",
          },
        ],
        memoryIds: ["fact-1"],
        now: "2026-04-24T00:00:01.000Z",
      },
    );
    const ledger = markWritebackAuditRecalled(
      markWritebackAuditRecalled(committed, {
        eventId,
        now: "2026-04-24T00:00:02.000Z",
        recallSessionDigest: "session:recall",
      }),
      {
        eventId,
        now: "2026-04-24T00:00:03.000Z",
        recallSessionDigest: "session:recall",
      },
    );

    expect(ledger.auditEvents[0]?.recallHitCount).toBe(1);
    expect(ledger.auditEvents[0]?.recalledBy).toHaveLength(1);
  });

  it("coerces raw digests when reading existing audit events", async () => {
    const homeRoot = await createHome("goodmemory-writeback-raw-digest-read-");

    try {
      await mkdir(join(homeRoot, ".goodmemory"), { recursive: true });
      await writeFile(
        join(homeRoot, ".goodmemory/codex-writeback-events.json"),
        JSON.stringify(
          {
            auditEvents: [
              {
                candidateKey: "candidate:raw",
                command: "session-end",
                contentPreview: "Next step is safe.",
                eventId: "wb_raw",
                forgottenLinkedRecordIds: [],
                forgottenMemoryIds: [],
                host: "codex",
                kind: "fact",
                linkedRecordIds: [],
                memoryIds: [],
                mode: "selective",
                occurredAt: "2026-04-24T00:00:00.000Z",
                reason: "open_loop",
                recallHitCount: 1,
                recalledBy: [
                  {
                    occurredAt: "2026-04-24T00:00:01.000Z",
                    sessionDigest: "raw-recall-session-id",
                  },
                ],
                scopeDigest: "raw-scope-id",
                sessionDigest: "raw-write-session-id",
                source: "user",
                status: "committed",
                updatedAt: "2026-04-24T00:00:00.000Z",
              },
            ],
            events: ["candidate:raw"],
            pending: [],
            version: 3,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );

      const ledger = await readInstalledHostWritebackLedger("codex", homeRoot);

      expect(JSON.stringify(ledger)).not.toContain("raw-write-session-id");
      expect(JSON.stringify(ledger)).not.toContain("raw-recall-session-id");
      expect(JSON.stringify(ledger)).not.toContain("raw-scope-id");
      expect(ledger.auditEvents[0]).toEqual(
        expect.objectContaining({
          scopeDigest: expect.stringMatching(/^scope:/u),
          sessionDigest: expect.stringMatching(/^session:/u),
          recalledBy: [
            {
              occurredAt: "2026-04-24T00:00:01.000Z",
              sessionDigest: expect.stringMatching(/^session:/u),
            },
          ],
        }),
      );
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
    }
  });

  it("sanitizes unsafe stored previews when reading existing audit events", async () => {
    const homeRoot = await createHome("goodmemory-writeback-unsafe-preview-read-");

    try {
      await mkdir(join(homeRoot, ".goodmemory"), { recursive: true });
      await writeFile(
        join(homeRoot, ".goodmemory/codex-writeback-events.json"),
        JSON.stringify(
          {
            auditEvents: [
              {
                candidateKey: "candidate:unsafe-preview",
                command: "session-end",
                contentPreview: "UNSAFE_ASSISTANT_OUTPUT should not survive read.",
                eventId: "wb_unsafe_preview",
                forgottenLinkedRecordIds: [],
                forgottenMemoryIds: [],
                host: "codex",
                kind: "fact",
                linkedRecordIds: [],
                memoryIds: [],
                mode: "selective",
                occurredAt: "2026-04-24T00:00:00.000Z",
                reason: "host_annotation",
                recallHitCount: 0,
                recalledBy: [],
                scopeDigest: "scope:raw",
                source: "assistant",
                status: "committed",
                updatedAt: "2026-04-24T00:00:00.000Z",
              },
            ],
            events: ["candidate:unsafe-preview"],
            pending: [],
            version: 3,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );

      const ledger = await readInstalledHostWritebackLedger("codex", homeRoot);

      expect(JSON.stringify(ledger)).not.toContain("UNSAFE_ASSISTANT_OUTPUT");
      expect(ledger.auditEvents[0]?.contentPreview).toBe(
        "[redacted assistant-originated candidate]",
      );
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
    }
  });

  it("drops unknown audit statuses without corrupting known events", async () => {
    const homeRoot = await createHome("goodmemory-writeback-unknown-status-read-");

    try {
      await mkdir(join(homeRoot, ".goodmemory"), { recursive: true });
      await writeFile(
        join(homeRoot, ".goodmemory/codex-writeback-events.json"),
        JSON.stringify(
          {
            auditEvents: [
              {
                candidateKey: "candidate:unknown",
                command: "session-end",
                contentPreview: "This event has a future status.",
                eventId: "wb_unknown",
                forgottenLinkedRecordIds: [],
                forgottenMemoryIds: [],
                host: "codex",
                kind: "fact",
                linkedRecordIds: [],
                memoryIds: [],
                mode: "observe",
                occurredAt: "2026-04-24T00:00:00.000Z",
                reason: "future_status",
                recallHitCount: 0,
                recalledBy: [],
                scopeDigest: "scope:demo",
                source: "user",
                status: "future_status",
                updatedAt: "2026-04-24T00:00:00.000Z",
              },
              {
                candidateKey: "candidate:observed",
                command: "session-end",
                contentPreview: "This observed event should survive.",
                eventId: "wb_observed",
                forgottenLinkedRecordIds: [],
                forgottenMemoryIds: [],
                host: "codex",
                kind: "preference",
                linkedRecordIds: [],
                memoryIds: [],
                mode: "observe",
                occurredAt: "2026-04-24T00:00:00.000Z",
                reason: "explicit_preference",
                recallHitCount: 0,
                recalledBy: [],
                scopeDigest: "scope:demo",
                source: "user",
                status: "observed",
                updatedAt: "2026-04-24T00:00:00.000Z",
              },
            ],
            events: ["candidate:committed"],
            pending: ["candidate:pending"],
            version: 4,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );

      const ledger = await readInstalledHostWritebackLedger("codex", homeRoot);

      expect(ledger.events).toEqual(["candidate:committed"]);
      expect(ledger.pending).toEqual(["candidate:pending"]);
      expect(ledger.auditEvents).toEqual([
        expect.objectContaining({
          eventId: "wb_observed",
          status: "observed",
        }),
      ]);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
    }
  });

  it("redacts json transcript-shaped content before persistence", () => {
    const eventId = buildWritebackAuditEventId({
      candidateKey: "candidate:json-transcript",
      scopeDigest: "scope:demo",
    });
    const ledger = markWritebackAuditPending(
      {
        auditEvents: [],
        events: [],
        pending: [],
        version: 3,
      },
      {
        candidateKey: "candidate:json-transcript",
        command: "session-end",
        content:
          '{"messages":[{"role":"user","content":"UNSAFE_JSON_TRANSCRIPT_PAYLOAD"}]}',
        eventId,
        host: "codex",
        kind: "fact",
        mode: "selective",
        now: "2026-04-24T00:00:00.000Z",
        reason: "open_loop",
        scopeDigest: "scope:demo",
        source: "user",
      },
    );

    expect(JSON.stringify(ledger)).not.toContain("UNSAFE_JSON_TRANSCRIPT_PAYLOAD");
    expect(ledger.auditEvents[0]?.contentPreview).toBe(
      "[redacted transcript-like content]",
    );
  });

  it("keeps the remember-tool command across a ledger write/read roundtrip", async () => {
    const homeRoot = await createHome("goodmemory-remember-tool-ledger-");
    try {
      const eventId = buildWritebackAuditEventId({
        candidateKey: "candidate:remember-tool",
        scopeDigest: "scope:demo",
      });
      let ledger = markWritebackAuditPending(
        {
          auditEvents: [],
          events: [],
          pending: [],
          version: 4,
        },
        {
          candidateKey: "candidate:remember-tool",
          command: "remember-tool",
          content: "The staging endpoint is db.internal.example.com.",
          eventId,
          host: "claude",
          kind: "fact",
          mode: "off",
          now: "2026-07-06T00:00:00.000Z",
          reason: "remember_tool",
          scopeDigest: "scope:demo",
          source: "assistant",
        },
      );
      ledger = markWritebackAuditCommitted(ledger, {
        candidateKey: "candidate:remember-tool",
        eventId,
        memoryIds: ["mem-1"],
        now: "2026-07-06T00:00:01.000Z",
      });
      await writeInstalledHostWritebackLedger("claude", homeRoot, ledger);

      const reread = await readInstalledHostWritebackLedger("claude", homeRoot);
      expect(reread.auditEvents).toEqual([
        expect.objectContaining({
          command: "remember-tool",
          eventId,
          memoryIds: ["mem-1"],
          mode: "off",
          status: "committed",
        }),
      ]);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
    }
  });
});
