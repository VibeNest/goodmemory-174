import { describe, expect, it } from "bun:test";
import { rememberRules } from "../../src";
import { resolveRememberProfile } from "../../src/remember/profiles";

const scope = { userId: "u-1", agentId: "life-coach" };
const rawExtractor = {
  async extract() {
    return {
      candidates: [],
      ignoredMessageCount: 0,
    };
  },
};

describe("remember profile rule helpers", () => {
  it("preserves metadata supplied through regex rules", () => {
    const rule = rememberRules.fact(/priority: (.+)/i, {
      id: "life-priority",
      content: ({ match }) => match[1] ?? "",
      metadata: {
        attributes: { horizon: "quarter" },
        category: "goal",
        tags: ["life_coach", "priority"],
      },
    });

    const [candidate] = rule.extract({
      scope,
      messages: [{ role: "user", content: "Priority: repair my sleep routine" }],
    });

    expect(candidate?.metadata).toEqual({
      attributes: { horizon: "quarter" },
      category: "goal",
      tags: ["life_coach", "priority"],
    });
  });

  it("supports predicate rules for message-level domain extraction", () => {
    const rule = rememberRules.predicate({
      id: "relationship-context",
      when: ({ message }) => message.content.toLowerCase().includes("my sister"),
      kindHint: "fact",
      content: ({ message }) => message.content,
      metadata: {
        category: "relationship_dynamic",
        tags: ["life_coach", "relationship"],
      },
    });

    const candidates = rule.extract({
      scope,
      messages: [
        { role: "user", content: "Small talk only." },
        {
          role: "user",
          content: "My sister and I are rebuilding trust after the move.",
        },
      ],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      id: "relationship-context-2",
      kindHint: "fact",
      content: "My sister and I are rebuilding trust after the move.",
      metadata: {
        category: "relationship_dynamic",
        tags: ["life_coach", "relationship"],
      },
      sourceMessageIndex: 1,
      sourceRole: "user",
    });
  });

  it("supports direct mapper rules for advanced server-side integrations", () => {
    const rule = rememberRules.mapper({
      id: "direct-life-goal",
      map: (input) => [
        {
          id: "direct-life-goal-1",
          kindHint: "fact",
          explicitness: "explicit",
          content: input.messages[0]?.content ?? "",
          sourceMessageIndex: 0,
          sourceRole: input.messages[0]?.role ?? "user",
          metadata: {
            attributes: { source: "host_mapper" },
            category: "goal",
            tags: ["direct_mapper"],
          },
        },
      ],
    });

    const [candidate] = rule.extract({
      scope,
      messages: [
        {
          role: "user",
          content: "I want a reliable morning routine before June.",
        },
      ],
    });

    expect(candidate).toMatchObject({
      id: "direct-life-goal-1",
      kindHint: "fact",
      ruleIds: ["direct-life-goal"],
      metadata: {
        attributes: { source: "host_mapper" },
        category: "goal",
        tags: ["direct_mapper"],
      },
    });
  });

  it("uses a catch-all profile only after scoped profiles do not match", () => {
    const resolved = resolveRememberProfile({
      scope,
      config: {
        profiles: [
          { id: "fallback-profile" },
          { id: "life-coach", when: { agentId: "life-coach" } },
        ],
      },
    });

    expect(resolved.id).toBe("life-coach");
  });

  it("normalizes raw and named profile extractors to stable trace ids", () => {
    const namedExtractor = {
      id: "life-coach-values-extractor",
      extractor: {
        async extract() {
          return {
            candidates: [],
            ignoredMessageCount: 0,
          };
        },
      },
    };
    const resolved = resolveRememberProfile({
      scope,
      config: {
        profiles: [
          {
            id: "life-coach",
            when: { agentId: "life-coach" },
            extractors: [rawExtractor, namedExtractor],
          },
        ],
      },
    });

    expect(resolved.extractors.map((extractor) => extractor.id)).toEqual([
      "life-coach:extractor-1",
      "life-coach-values-extractor",
    ]);
    expect(resolved.extractors[0]?.extractor).toBe(rawExtractor);
    expect(resolved.extractors[1]?.extractor).toBe(namedExtractor.extractor);
  });

  it("rejects blank named profile extractor ids", () => {
    expect(() =>
      resolveRememberProfile({
        scope,
        config: {
          profiles: [
            {
              id: "life-coach",
              when: { agentId: "life-coach" },
              extractors: [
                {
                  id: "   ",
                  extractor: rawExtractor,
                },
              ],
            },
          ],
        },
      })
    ).toThrow(
      'Remember profile "life-coach" extractor id at index 1 must not be blank.',
    );
  });

  it("rejects duplicate or raw-namespace profile extractor ids", () => {
    expect(() =>
      resolveRememberProfile({
        scope,
        config: {
          profiles: [
            {
              id: "life-coach",
              when: { agentId: "life-coach" },
              extractors: [
                rawExtractor,
                {
                  id: "life-coach:extractor-1",
                  extractor: rawExtractor,
                },
              ],
            },
          ],
        },
      })
    ).toThrow(
      'Remember profile "life-coach" extractor id "life-coach:extractor-1" is reserved for generated raw extractor ids.',
    );

    expect(() =>
      resolveRememberProfile({
        scope,
        config: {
          profiles: [
            {
              id: "life-coach",
              when: { agentId: "life-coach" },
              extractors: [
                {
                  id: "life-coach-values-extractor",
                  extractor: rawExtractor,
                },
                {
                  id: "life-coach-values-extractor",
                  extractor: rawExtractor,
                },
              ],
            },
          ],
        },
      })
    ).toThrow(
      'Remember profile "life-coach" has duplicate extractor id "life-coach-values-extractor".',
    );
  });
});
