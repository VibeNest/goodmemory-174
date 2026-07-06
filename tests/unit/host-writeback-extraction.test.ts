import { describe, expect, it } from "bun:test";
import type { MemoryCandidate, MemoryExtractor } from "../../src/remember/candidates";
import { DEFAULT_INSTALLED_HOST_WRITEBACK } from "../../src/install/hostConfigValidation";
import { buildAssistedWritebackCandidates } from "../../src/install/hostWritebackExtraction";

// Batch LLM pre-extraction for writeback: one extractor call over the whole
// bounded delta window, so the LLM can recover durable signals the regex
// floor misses. The per-candidate strategy flag alone cannot do this — it
// only re-extracts messages the regex already selected.

const SCOPE = { userId: "batch-user", workspaceId: "workspace-b" };

function candidate(overrides: Partial<MemoryCandidate>): MemoryCandidate {
  return {
    content: "The staging database is postgres 16 behind pgbouncer.",
    explicitness: "explicit",
    id: "cand-1",
    kindHint: "fact",
    sourceMessageIndex: 0,
    sourceRole: "user",
    ...overrides,
  };
}

function fakeExtractor(
  candidates: MemoryCandidate[],
  seenInputs: Array<{ content: string; role: string }>[] = [],
): MemoryExtractor {
  return {
    async extract(input) {
      seenInputs.push(input.messages.map((message) => ({ ...message })));
      return { candidates, ignoredMessageCount: 0 };
    },
  };
}

describe("buildAssistedWritebackCandidates", () => {
  it("sends the whole bounded window to the extractor in one call", async () => {
    const seen: Array<{ content: string; role: string }>[] = [];
    const result = await buildAssistedWritebackCandidates({
      command: "turn-end",
      config: { ...DEFAULT_INSTALLED_HOST_WRITEBACK, mode: "selective" },
      extractor: fakeExtractor([candidate({})], seen),
      host: "claude",
      messages: [
        { content: "We moved staging to postgres 16.", role: "user" },
        { content: "Noted, updating the runbook.", role: "assistant" },
      ],
      scope: SCOPE,
    });

    expect(result.status).toBe("ok");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual([
      { content: "We moved staging to postgres 16.", role: "user" },
      { content: "Noted, updating the runbook.", role: "assistant" },
    ]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      confidence: 0.85,
      durable: true,
      kind: "fact",
      reason: "llm_extraction",
      source: "user",
    });
    expect(result.candidates[0]?.messageAnnotation).toMatchObject({
      kindHint: "fact",
      remember: "always",
    });
  });

  it("maps kinds and confidence and drops noise", async () => {
    const result = await buildAssistedWritebackCandidates({
      command: "turn-end",
      config: { ...DEFAULT_INSTALLED_HOST_WRITEBACK, mode: "selective" },
      extractor: fakeExtractor([
        candidate({ id: "c-profile", kindHint: "profile" }),
        candidate({
          content: "Prefer table-driven tests in this repo.",
          explicitness: "inferred",
          id: "c-pref",
          kindHint: "preference",
        }),
        candidate({ content: "hmm ok", id: "c-noise", kindHint: "noise" }),
      ]),
      host: "claude",
      messages: [{ content: "window", role: "user" }],
      scope: SCOPE,
    });

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toMatchObject({ durable: true, kind: "fact" });
    expect(result.candidates[1]).toMatchObject({
      confidence: 0.75,
      durable: true,
      kind: "preference",
    });
  });

  it("keeps assistant-derived candidates governed by the assistant policy", async () => {
    const result = await buildAssistedWritebackCandidates({
      command: "turn-end",
      config: { ...DEFAULT_INSTALLED_HOST_WRITEBACK, mode: "selective" },
      extractor: fakeExtractor([
        candidate({
          content: "We decided to gate deploys on the smoke suite.",
          id: "c-assistant",
          sourceRole: "assistant",
        }),
      ]),
      host: "claude",
      messages: [{ content: "window", role: "assistant" }],
      scope: SCOPE,
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      durable: false,
      reason: "assistant_policy_blocked",
      source: "assistant",
    });
  });

  it("redacts secret-like extractor output", async () => {
    const result = await buildAssistedWritebackCandidates({
      command: "turn-end",
      config: { ...DEFAULT_INSTALLED_HOST_WRITEBACK, mode: "selective" },
      extractor: fakeExtractor([
        candidate({
          content: "Use api_key: sk-abcdefghijklmnopqrstuvwx for the bridge.",
          id: "c-secret",
        }),
      ]),
      host: "claude",
      messages: [{ content: "window", role: "user" }],
      scope: SCOPE,
    });

    expect(result.candidates[0]).toMatchObject({
      confidence: 0,
      content: "[redacted secret-like content]",
      durable: false,
    });
  });

  it("fails open to rules when the extractor throws or times out", async () => {
    const throwing = await buildAssistedWritebackCandidates({
      command: "turn-end",
      config: { ...DEFAULT_INSTALLED_HOST_WRITEBACK, mode: "selective" },
      extractor: {
        async extract() {
          throw new Error("provider down");
        },
      },
      host: "claude",
      messages: [{ content: "window", role: "user" }],
      scope: SCOPE,
    });
    expect(throwing).toEqual({ candidates: [], status: "extractor_failed" });

    const hanging = await buildAssistedWritebackCandidates({
      command: "turn-end",
      config: { ...DEFAULT_INSTALLED_HOST_WRITEBACK, mode: "selective" },
      extractor: {
        extract: () => new Promise(() => undefined),
      },
      host: "claude",
      messages: [{ content: "window", role: "user" }],
      scope: SCOPE,
      timeoutMs: 20,
    });
    expect(hanging).toEqual({ candidates: [], status: "extractor_failed" });
  });
});
