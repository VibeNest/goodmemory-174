import { describe, expect, it } from "bun:test";
import { createGoodMemory } from "../../src";

describe("governance policy hooks", () => {
  it("blocks writes with shouldRemember and redacts candidate content before persist", async () => {
    const memory = createGoodMemory({
      storage: { provider: "memory" },
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
      query: "What do you remember?",
    });

    expect(result.events.some((event) => event.reason === "policy_blocked")).toBe(true);
    expect(recall.preferences).toHaveLength(0);
    expect(recall.facts[0]?.content).toContain("[REDACTED]");
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
      query: "What do you remember?",
    });

    expect(result.accepted).toBe(0);
    expect(result.events.some((event) => event.reason === "invalid_after_redaction")).toBe(
      true,
    );
    expect(recall.facts).toHaveLength(0);
  });
});
