import { describe, expect, it } from "bun:test";
import { createGoodMemory } from "../../src";
import {
  EVIDENCE_COLLECTION,
  SOURCE_MESSAGES_COLLECTION,
} from "../../src/evidence/contracts";
import type {
  EvidenceRecord,
  SourceMessageRecord,
} from "../../src/evidence/contracts";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
} from "../../src/storage/memory";

describe("governance policy hooks", () => {
  it("blocks writes with shouldRemember and redacts candidate content before persist", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
      policy: {
        shouldRemember(candidate) {
          return candidate.kindHint !== "preference";
        },
        redact(candidate) {
          if (candidate.kindHint !== "fact") {
            return candidate;
          }

          return {
            ...candidate,
            content: candidate.content.replace("prod", "[REDACTED]"),
          };
        },
      },
    });

    const result = await memory.remember({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      messages: [
        {
          role: "user",
          content: "Remember that the rollout is blocked on prod verification.",
        },
        {
          role: "user",
          content: "I prefer bullet points in summaries.",
        },
      ],
    });
    const recall = await memory.recall({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      query: "What is the rollout blocker?",
    });

    expect(result.events.some((event) => event.reason === "policy_blocked")).toBe(true);
    expect(recall.preferences).toHaveLength(0);
    expect(recall.facts[0]?.content).toContain("[REDACTED]");
    const evidence = await documentStore.query<EvidenceRecord>(
      EVIDENCE_COLLECTION,
      { userId: "u-1", workspaceId: "workspace-a" },
    );
    const sourceMessages = await documentStore.query<SourceMessageRecord>(
      SOURCE_MESSAGES_COLLECTION,
      { userId: "u-1", workspaceId: "workspace-a" },
    );
    expect(evidence[0]?.excerpt).toContain("[REDACTED]");
    expect(evidence[0]?.excerpt).not.toContain("prod");
    expect(sourceMessages[0]?.content).toContain("[REDACTED]");
    expect(sourceMessages[0]?.content).not.toContain("prod");
  });

  it("does not synthesize an episode when governance blocks every candidate", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      policy: {
        shouldRemember() {
          return false;
        },
      },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });

    const result = await memory.remember({
      scope: { userId: "u-episode-block", workspaceId: "workspace-a", sessionId: "s-1" },
      messages: [
        {
          role: "user",
          content: "Remember that the rollout is blocked on prod verification.",
        },
        {
          role: "assistant",
          content: "I will remember that the rollout is blocked on prod verification.",
        },
      ],
    });

    expect(result.accepted).toBe(0);
    expect(result.events.some((event) => event.reason === "conversation_episode")).toBe(
      false,
    );
    expect(
      await documentStore.query("episodes", {
        userId: "u-episode-block",
        workspaceId: "workspace-a",
      }),
    ).toHaveLength(0);
  });

  it("applies redaction to synthesized episode content", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      policy: {
        redact(candidate) {
          if (candidate.kindHint !== "fact") {
            return candidate;
          }

          return {
            ...candidate,
            content: candidate.content.replace("prod verification", "[REDACTED]"),
          };
        },
      },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });

    await memory.remember({
      scope: { userId: "u-episode-redact", workspaceId: "workspace-a", sessionId: "s-1" },
      messages: [
        {
          role: "user",
          content: "Remember that the rollout is blocked on prod verification.",
        },
        {
          role: "assistant",
          content: "I will remember that the rollout is blocked on prod verification.",
        },
      ],
    });

    const episodes = await documentStore.query<{
      keyDecisions: string[];
      summary: string;
    }>("episodes", {
      userId: "u-episode-redact",
      workspaceId: "workspace-a",
    });

    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.summary).toContain("[REDACTED]");
    expect(episodes[0]?.summary).not.toContain("prod verification");
    expect(episodes[0]?.keyDecisions[0]).toContain("[REDACTED]");
    expect(episodes[0]?.keyDecisions[0]).not.toContain("prod verification");
  });

  it("rejects candidates that become invalid after redaction", async () => {
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      policy: {
        redact(candidate) {
          if (candidate.kindHint !== "fact") {
            return candidate;
          }

          return {
            ...candidate,
            content: "",
          };
        },
      },
    });

    const result = await memory.remember({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      messages: [
        {
          role: "user",
          content: "Remember that the rollout is blocked on prod verification.",
        },
      ],
    });
    const recall = await memory.recall({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      query: "What is the rollout blocker?",
    });

    expect(result.accepted).toBe(0);
    expect(result.events.some((event) => event.reason === "invalid_after_redaction")).toBe(
      true,
    );
    expect(recall.facts).toHaveLength(0);
  });
});
