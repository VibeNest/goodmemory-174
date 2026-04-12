import { describe, expect, it } from "bun:test";
import { createLanguageService } from "../../src/language";
import { maybeBuildEpisode } from "../../src/remember/episodes";

const TIMESTAMP = "2026-01-10T00:00:00.000Z";

describe("remember episodes", () => {
  it("skips episodic synthesis for pure assistant acknowledgement", () => {
    const episode = maybeBuildEpisode(
      {
        scope: { userId: "user-1", sessionId: "s-1" },
        messages: [
          { role: "user", content: "Remember that runtime rollout is blocked." },
          { role: "assistant", content: "Okay." },
        ],
      },
      [
        {
          id: "candidate-1",
          kindHint: "fact",
          explicitness: "explicit",
          content: "Runtime rollout is blocked.",
          sourceMessageIndex: 0,
          sourceRole: "user",
        },
      ],
      "episode-1",
      TIMESTAMP,
      createLanguageService(),
      "en-US",
    );

    expect(episode).toBeNull();
  });

  it("builds an episode when the assistant contributes substantive follow-through", () => {
    const episode = maybeBuildEpisode(
      {
        scope: { userId: "user-1", sessionId: "s-1" },
        messages: [
          { role: "user", content: "Remember that runtime rollout is blocked on legal signoff." },
          { role: "assistant", content: "I will keep that blocker and the next review step in mind." },
        ],
      },
      [
        {
          id: "candidate-1",
          kindHint: "fact",
          explicitness: "explicit",
          content: "Runtime rollout is blocked on legal signoff.",
          sourceMessageIndex: 0,
          sourceRole: "user",
          metadata: {
            category: "project",
            factKind: "blocker",
          },
        },
      ],
      "episode-1",
      TIMESTAMP,
      createLanguageService(),
      "en-US",
    );

    expect(episode?.id).toBe("episode-1");
    expect(episode?.summary).toContain("Assistant follow-through");
    expect(episode?.keyDecisions[0]).toContain("Assistant follow-through on");
    expect(episode?.keyDecisions[0]).toContain("Runtime rollout is blocked on legal signoff.");
  });

  it("does not persist paraphrased assistant follow-through that reintroduces redacted content", () => {
    const episode = maybeBuildEpisode(
      {
        scope: { userId: "user-1", sessionId: "s-1" },
        messages: [
          {
            role: "user",
            content: "Remember that the rollout is blocked on prod verification.",
          },
          {
            role: "assistant",
            content: "I will keep the prod verification blocker in mind for rollout.",
          },
        ],
      },
      [
        {
          id: "candidate-1",
          kindHint: "fact",
          explicitness: "explicit",
          content: "the rollout is blocked on [REDACTED].",
          sourceMessageIndex: 0,
          sourceRole: "user",
          metadata: {
            category: "project",
            factKind: "blocker",
            subject: "prod verification",
          },
        },
      ],
      "episode-1",
      TIMESTAMP,
      createLanguageService(),
      "en-US",
    );

    expect(episode?.summary).not.toContain("prod verification");
    expect(episode?.keyDecisions.join("\n")).not.toContain("prod verification");
    expect(episode?.summary).toContain("Assistant follow-through captured.");
  });

  it("derives episode topics from redacted candidate content instead of raw metadata", () => {
    const episode = maybeBuildEpisode(
      {
        scope: { userId: "user-1", sessionId: "s-1" },
        messages: [
          {
            role: "user",
            content: "Remember that the rollout is blocked on prod verification.",
          },
          {
            role: "assistant",
            content: "I will keep the rollout blocker in mind.",
          },
        ],
      },
      [
        {
          id: "candidate-1",
          kindHint: "fact",
          explicitness: "explicit",
          content: "the rollout is blocked on [REDACTED].",
          sourceMessageIndex: 0,
          sourceRole: "user",
          metadata: {
            category: "project",
            factKind: "blocker",
            subject: "prod verification",
          },
        },
      ],
      "episode-1",
      TIMESTAMP,
      createLanguageService(),
      "en-US",
    );

    expect(episode?.topics.join("\n")).not.toContain("prod verification");
    expect(episode?.topics).toContain("the rollout is");
  });

  it("does not invent assistant follow-through when the assistant message is unrelated", () => {
    const episode = maybeBuildEpisode(
      {
        scope: { userId: "user-1", sessionId: "s-1" },
        messages: [
          {
            role: "user",
            content: "Remember that runtime rollout is blocked on legal signoff.",
          },
          {
            role: "assistant",
            content: "I also drafted the release note template for tomorrow's stakeholder review.",
          },
        ],
      },
      [
        {
          id: "candidate-1",
          kindHint: "fact",
          explicitness: "explicit",
          content: "Runtime rollout is blocked on legal signoff.",
          sourceMessageIndex: 0,
          sourceRole: "user",
          metadata: {
            category: "project",
            factKind: "blocker",
          },
        },
      ],
      "episode-1",
      TIMESTAMP,
      createLanguageService(),
      "en-US",
    );

    expect(episode).toBeNull();
  });

  it("does not treat overlapping non-continuity commentary as assistant follow-through", () => {
    const episode = maybeBuildEpisode(
      {
        scope: { userId: "user-1", sessionId: "s-1" },
        messages: [
          {
            role: "user",
            content: "Remember that runtime rollout is blocked on legal signoff.",
          },
          {
            role: "assistant",
            content: "That rollout blocker sounds frustrating, and legal review seems slow.",
          },
        ],
      },
      [
        {
          id: "candidate-1",
          kindHint: "fact",
          explicitness: "explicit",
          content: "Runtime rollout is blocked on legal signoff.",
          sourceMessageIndex: 0,
          sourceRole: "user",
          metadata: {
            category: "project",
            factKind: "blocker",
          },
        },
      ],
      "episode-1",
      TIMESTAMP,
      createLanguageService(),
      "en-US",
    );

    expect(episode).toBeNull();
  });

  it("does not bind one continuity reply to multiple same-kind candidates", () => {
    const episode = maybeBuildEpisode(
      {
        scope: { userId: "user-1", sessionId: "s-1" },
        messages: [
          {
            role: "user",
            content: "Use docs/runbook-a.md as the source of truth.",
          },
          {
            role: "user",
            content: "Use docs/runbook-b.md as the source of truth.",
          },
          {
            role: "assistant",
            content: "I will use the newer runbook going forward.",
          },
        ],
      },
      [
        {
          id: "candidate-1",
          kindHint: "reference",
          explicitness: "explicit",
          content: "docs/runbook-a.md",
          sourceMessageIndex: 0,
          sourceRole: "user",
          metadata: {
            referenceKind: "runbook",
            referencePointer: "docs/runbook-a.md",
          },
        },
        {
          id: "candidate-2",
          kindHint: "reference",
          explicitness: "explicit",
          content: "docs/runbook-b.md",
          sourceMessageIndex: 1,
          sourceRole: "user",
          metadata: {
            referenceKind: "runbook",
            referencePointer: "docs/runbook-b.md",
          },
        },
      ],
      "episode-1",
      TIMESTAMP,
      createLanguageService(),
      "en-US",
    );

    expect(episode?.summary).toContain("Assistant substantive continuity captured.");
    expect(episode?.keyDecisions).toHaveLength(0);
  });
});
