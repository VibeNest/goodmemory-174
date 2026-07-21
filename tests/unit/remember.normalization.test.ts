import { describe, expect, it } from "bun:test";

import { normalizeMemoryCandidate } from "../../src/remember/normalization";
import { createLanguageService } from "../../src/language";

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
    const language = createLanguageService();
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
      {
        language,
        resolved: language.resolveFromText({
          locale: "en-US",
          text: "My name is Nadia and I work in Toronto.",
        }),
      },
    );

    expect(normalized.content).toBe("Nadia");
    expect(normalized.metadata?.profileField).toBe("name");
  });

  it("uses the bounded source name when assisted extraction includes a trailing clause", () => {
    const language = createLanguageService();
    const cases = [
      {
        expected: "Nadia",
        source: "My name is Nadia and my role is designer.",
      },
      {
        expected: "Mary Jane",
        source: "My name is Mary Jane and she works in Toronto.",
      },
      {
        expected: "John Q. Public",
        source: "My name is John Q. Public.",
      },
    ];

    for (const [index, { expected, source }] of cases.entries()) {
      const normalized = normalizeMemoryCandidate(
        {
          id: `assisted-name-${index}`,
          kindHint: "profile",
          explicitness: "explicit",
          content: `User profile name: ${source}`,
          sourceMessageIndex: 0,
          sourceRole: "user",
          metadata: { profileField: "name" },
        },
        source,
        {
          language,
          resolved: language.resolveFromText({ locale: "en-US", text: source }),
        },
      );

      expect(normalized.content).toBe(expected);
    }
  });
});
