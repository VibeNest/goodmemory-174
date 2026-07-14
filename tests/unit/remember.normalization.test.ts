import { describe, expect, it } from "bun:test";

import { normalizeMemoryCandidate } from "../../src/remember/normalization";

describe("profile candidate normalization", () => {
  it("does not turn a contextual topic into a profile name", () => {
    const normalized = normalizeMemoryCandidate(
      {
        id: "topic-profile",
        kindHint: "profile",
        explicitness: "explicit",
        content:
          "Career and well-being discussion: The user wants a role that supports personal well-being.",
        sourceMessageIndex: 0,
        sourceRole: "user",
      },
      "I've been reflecting on my career and need to make a change.",
    );

    expect(normalized.content).toStartWith("Career and well-being discussion");
    expect(normalized.metadata?.profileField).toBeUndefined();
  });

  it("still salvages a missing name field from an explicit name statement", () => {
    const normalized = normalizeMemoryCandidate(
      {
        id: "explicit-name",
        kindHint: "profile",
        explicitness: "explicit",
        content: "User's name is Nadia and she works in Toronto.",
        sourceMessageIndex: 0,
        sourceRole: "user",
      },
      "My name is Nadia and I work in Toronto.",
    );

    expect(normalized.content).toBe("Nadia");
    expect(normalized.metadata?.profileField).toBe("name");
  });
});
