import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GoodMemory } from "../../src/api/contracts";
import { scopeToKey } from "../../src/domain/scope";
import { readInspectorAuditLedger } from "../../src/inspector/auditLog";
import {
  approveCandidate,
  listReviewCandidateViews,
  recoverCandidateApproval,
  rejectCandidate,
} from "../../src/inspector/candidateReview";
import {
  buildReviewCandidateId,
  getReviewCandidate,
  persistReviewCandidates,
  updateReviewCandidateStatus,
} from "../../src/install/hostReviewQueue";

const FIXED_NOW = (): Date => new Date("2026-07-07T00:00:00.000Z");
const SCOPE = { userId: "userA" } as const;

let dirs: string[] = [];

async function tempHome(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "gm-inspector-cand-"));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  dirs = [];
});

function fakeMemory(options: { accepted: number; memoryIds: string[] }): {
  memory: Pick<GoodMemory, "remember">;
  calls: unknown[];
} {
  const calls: unknown[] = [];
  const memory = {
    remember: async (input: unknown) => {
      calls.push(input);
      return {
        accepted: options.accepted,
        events: options.memoryIds.map((id) => ({ memoryId: id, memoryType: "fact" })),
      } as unknown as Awaited<ReturnType<GoodMemory["remember"]>>;
    },
  } as Pick<GoodMemory, "remember">;
  return { memory, calls };
}

function deferred<T = void>(): {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value?: T | PromiseLike<T>) => void;
} {
  let resolve!: (value?: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = (value) => {
      resolvePromise(value as T | PromiseLike<T>);
    };
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function seed(home: string, candidateKey: string, content: string): Promise<string> {
  await persistReviewCandidates({
    homeRoot: home,
    now: FIXED_NOW,
    candidates: [
      {
        host: "claude",
        scope: SCOPE,
        candidateKey,
        kind: "preference",
        content,
        reason: "stated preference",
        source: "user",
        confidence: 0.9,
      },
    ],
  });
  return buildReviewCandidateId({ scope: SCOPE, candidateKey });
}

describe("candidate review", () => {
  it("approves a pending candidate, promoting it to durable memory and auditing", async () => {
    const home = await tempHome();
    const id = await seed(home, "k1", "User prefers dark mode.");
    const { memory, calls } = fakeMemory({ accepted: 1, memoryIds: ["mem-1"] });

    const result = await approveCandidate({
      candidateId: id,
      scope: SCOPE,
      reviewReason: "looks right",
      deps: { memory, homeRoot: home, now: FIXED_NOW, newActionId: () => "insp_a1" },
    });

    expect(result.status).toBe("approved");
    expect(result.memoryIds).toEqual(["mem-1"]);
    expect(calls).toHaveLength(1);
    // remember was called with a force-add annotation.
    expect((calls[0] as { annotations: Array<{ remember: string }> }).annotations[0]?.remember).toBe(
      "always",
    );

    const stored = await getReviewCandidate({ homeRoot: home, id });
    expect(stored?.status).toBe("approved");
    expect(stored?.memoryIds).toEqual(["mem-1"]);

    const audit = await readInspectorAuditLedger(home);
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]?.action).toBe("approve");
    expect(audit.events[0]?.resultStatus).toBe("ok");
    expect(audit.events[0]?.resultMemoryIds).toEqual(["mem-1"]);
  });

  it("reserves approval before durable remember so concurrent approves cannot replay", async () => {
    const home = await tempHome();
    const id = await seed(home, "k-reserve", "User prefers review mode.");
    const rememberStarted = deferred();
    const releaseRemember = deferred();
    let rememberCalls = 0;
    const memory = {
      remember: async () => {
        rememberCalls += 1;
        rememberStarted.resolve();
        const storedDuringRemember = await getReviewCandidate({ homeRoot: home, id });
        expect(storedDuringRemember?.status).toBe("approving");
        await releaseRemember.promise;
        return {
          accepted: 1,
          events: [{ memoryId: "mem-reserved", memoryType: "fact" }],
        } as unknown as Awaited<ReturnType<GoodMemory["remember"]>>;
      },
    } as Pick<GoodMemory, "remember">;

    const first = approveCandidate({
      candidateId: id,
      scope: SCOPE,
      deps: { memory, homeRoot: home, now: FIXED_NOW, newActionId: () => "insp_reserve_1" },
    });
    await rememberStarted.promise;

    const second = await approveCandidate({
      candidateId: id,
      scope: SCOPE,
      deps: { memory, homeRoot: home, now: FIXED_NOW, newActionId: () => "insp_reserve_2" },
    });
    expect(second.status).toBe("not_pending");
    expect(rememberCalls).toBe(1);

    releaseRemember.resolve();
    const firstResult = await first;
    expect(firstResult.status).toBe("approved");
    expect(firstResult.memoryIds).toEqual(["mem-reserved"]);
    expect(rememberCalls).toBe(1);
  });

  it("releases the approval reservation when durable remember fails", async () => {
    const home = await tempHome();
    const id = await seed(home, "k-fail", "User prefers retryable approvals.");
    let rememberCalls = 0;
    const memory = {
      remember: async () => {
        rememberCalls += 1;
        throw new Error("provider unavailable");
      },
    } as Pick<GoodMemory, "remember">;

    const result = await approveCandidate({
      candidateId: id,
      scope: SCOPE,
      deps: { memory, homeRoot: home, now: FIXED_NOW, newActionId: () => "insp_fail_1" },
    });

    expect(result.status).toBe("approval_failed");
    expect(rememberCalls).toBe(1);
    const stored = await getReviewCandidate({ homeRoot: home, id });
    expect(stored?.status).toBe("pending");
    expect(stored?.reviewError).toContain("provider unavailable");

    const { memory: retryMemory } = fakeMemory({ accepted: 1, memoryIds: ["mem-after-retry"] });
    const retry = await approveCandidate({
      candidateId: id,
      scope: SCOPE,
      deps: {
        memory: retryMemory,
        homeRoot: home,
        now: FIXED_NOW,
        newActionId: () => "insp_fail_retry",
      },
    });
    expect(retry.status).toBe("approved");
    expect(retry.memoryIds).toEqual(["mem-after-retry"]);
  });

  it("requires operator recovery before retrying a stale interrupted approval", async () => {
    const home = await tempHome();
    const id = await seed(home, "k-stale", "User prefers stale approval recovery.");
    await updateReviewCandidateStatus({
      homeRoot: home,
      id,
      status: "approving",
      now: () => new Date("2000-01-01T00:00:00.000Z"),
    });

    const views = await listReviewCandidateViews({
      scopeKey: scopeToKey(SCOPE),
      homeRoot: home,
    });
    expect(views).toEqual([
      expect.objectContaining({
        approvable: false,
        id,
        recoverable: true,
        status: "approval_interrupted",
      }),
    ]);

    const { memory } = fakeMemory({ accepted: 1, memoryIds: ["mem-stale"] });
    const blocked = await approveCandidate({
      candidateId: id,
      scope: SCOPE,
      deps: { memory, homeRoot: home, now: FIXED_NOW, newActionId: () => "insp_stale_blocked" },
    });
    expect(blocked.status).toBe("not_pending");

    const recovered = await recoverCandidateApproval({
      candidateId: id,
      scope: SCOPE,
      deps: { memory, homeRoot: home, now: FIXED_NOW, newActionId: () => "insp_stale_recover" },
    });
    expect(recovered.status).toBe("released");
    const pending = await getReviewCandidate({ homeRoot: home, id });
    expect(pending?.status).toBe("pending");
    expect(pending?.reviewError).toContain("Verify whether durable memory");

    const result = await approveCandidate({
      candidateId: id,
      scope: SCOPE,
      deps: { memory, homeRoot: home, now: FIXED_NOW, newActionId: () => "insp_stale" },
    });

    expect(result.status).toBe("approved");
    expect(result.memoryIds).toEqual(["mem-stale"]);
  });

  it("rejects a pending candidate without writing memory, and audits", async () => {
    const home = await tempHome();
    const id = await seed(home, "k2", "User likes tabs over spaces.");
    const { memory, calls } = fakeMemory({ accepted: 1, memoryIds: ["should-not-happen"] });

    const result = await rejectCandidate({
      candidateId: id,
      scope: SCOPE,
      reviewReason: "not durable",
      deps: { memory, homeRoot: home, now: FIXED_NOW, newActionId: () => "insp_r1" },
    });

    expect(result.status).toBe("rejected");
    expect(calls).toHaveLength(0);

    const stored = await getReviewCandidate({ homeRoot: home, id });
    expect(stored?.status).toBe("rejected");

    const audit = await readInspectorAuditLedger(home);
    expect(audit.events[0]?.action).toBe("reject");
    expect(audit.events[0]?.resultStatus).toBe("ok");
  });

  it("marks an approve rejected_by_governance when remember accepts nothing", async () => {
    const home = await tempHome();
    const id = await seed(home, "k3", "Ambiguous statement.");
    const { memory } = fakeMemory({ accepted: 0, memoryIds: [] });

    const result = await approveCandidate({
      candidateId: id,
      scope: SCOPE,
      deps: { memory, homeRoot: home, now: FIXED_NOW, newActionId: () => "insp_g1" },
    });

    expect(result.status).toBe("rejected_by_governance");
    expect(result.memoryIds).toEqual([]);
    const stored = await getReviewCandidate({ homeRoot: home, id });
    expect(stored?.status).toBe("rejected");
    const audit = await readInspectorAuditLedger(home);
    expect(audit.events[0]?.resultStatus).toBe("error");
  });

  it("refuses to approve a candidate from a different scope", async () => {
    const home = await tempHome();
    const id = await seed(home, "k4", "Scoped preference.");
    const { memory, calls } = fakeMemory({ accepted: 1, memoryIds: ["mem-x"] });

    const result = await approveCandidate({
      candidateId: id,
      scope: { userId: "someone-else" },
      deps: { memory, homeRoot: home, now: FIXED_NOW },
    });

    expect(result.status).toBe("scope_mismatch");
    expect(calls).toHaveLength(0);
  });

  it("returns not_found for an unknown candidate id", async () => {
    const home = await tempHome();
    const { memory } = fakeMemory({ accepted: 1, memoryIds: [] });
    const result = await approveCandidate({
      candidateId: "rc_missing",
      scope: SCOPE,
      deps: { memory, homeRoot: home, now: FIXED_NOW },
    });
    expect(result.status).toBe("not_found");
  });

  it("lists pending review candidates as approvable views", async () => {
    const home = await tempHome();
    await seed(home, "k5", "One.");
    await seed(home, "k6", "Two.");

    const views = await listReviewCandidateViews({
      scopeKey: scopeToKey(SCOPE),
      homeRoot: home,
    });
    expect(views).toHaveLength(2);
    expect(views.every((view) => view.approvable && view.source === "review-queue")).toBe(true);
  });
});
