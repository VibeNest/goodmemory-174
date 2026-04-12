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
        },
      ],
      "episode-1",
      TIMESTAMP,
      createLanguageService(),
      "en-US",
    );

    expect(episode?.id).toBe("episode-1");
    expect(episode?.summary).toContain("Assistant follow-through");
    expect(episode?.keyDecisions[0]).toContain("blocker");
  });
});
