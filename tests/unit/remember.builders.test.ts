import { describe, expect, it } from "bun:test";
import {
  createFactMemory,
  createReferenceMemory,
} from "../../src/domain/records";
import {
  enrichDuplicateFact,
  resolveReferenceSubject,
} from "../../src/remember/builders";
import type { ClassifiedCandidate } from "../../src/remember/contracts";

const TIMESTAMP = "2026-01-10T00:00:00.000Z";

describe("remember builders", () => {
  it("inherits a corrected reference subject from the superseded pointer", () => {
    const candidate: ClassifiedCandidate = {
      id: "candidate-1",
      kindHint: "reference",
      explicitness: "explicit",
      content: "docs/runtime-runbook-v2.md",
      sourceMessageIndex: 0,
      sourceRole: "user",
      decision: "write",
      memoryType: "reference",
      score: 0.9,
      metadata: {
        supersedesPointer: "docs/runtime-runbook-v1.md",
      },
    };

    const subject = resolveReferenceSubject(candidate, [
      createReferenceMemory({
        id: "ref-old",
        userId: "user-1",
        title: "Runtime Runbook",
        pointer: "docs/runtime-runbook-v1.md",
        subject: "runtime rollout",
        source: {
          method: "explicit",
          extractedAt: TIMESTAMP,
        },
        lifecycle: "active",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      }),
    ]);

    expect(subject).toBe("runtime rollout");
  });

  it("enriches duplicate facts with stronger metadata and provenance", () => {
    const enriched = enrichDuplicateFact(
      createFactMemory({
        id: "fact-1",
        userId: "user-1",
        category: "project",
        content: "Runtime rollout still needs legal signoff.",
        source: {
          method: "inferred",
          extractedAt: TIMESTAMP,
          locale: "zh-TW",
          localeSource: "explicit",
          languagePackId: "zh-Hant",
          languagePackVersion: "2-opencc-1.4.1",
        },
        subject: "unknown",
        updatedAt: TIMESTAMP,
      }),
      {
        id: "candidate-1",
        kindHint: "fact",
        explicitness: "explicit",
        content: "Runtime rollout still needs legal signoff.",
        sourceMessageIndex: 0,
        sourceRole: "user",
        decision: "write",
        memoryType: "fact",
        score: 0.92,
        metadata: {
          category: "technical",
          factKind: "open_loop",
          scopeKind: "project",
          subject: "runtime rollout",
        },
      },
      TIMESTAMP,
      {
        locale: "zh-CN",
        localeSource: "explicit",
        languagePackId: "zh-Hans",
        languagePackVersion: "2-opencc-1.4.1",
      },
    );

    expect(enriched?.category).toBe("technical");
    expect(enriched?.factKind).toBe("open_loop");
    expect(enriched?.subject).toBe("runtime rollout");
    expect(enriched?.source.method).toBe("explicit");
    expect(enriched?.source).toMatchObject({
      locale: "zh-TW",
      localeSource: "explicit",
      languagePackId: "zh-Hant",
      languagePackVersion: "2-opencc-1.4.1",
    });
  });
});
