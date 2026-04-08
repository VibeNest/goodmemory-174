import { describe, expect, it } from "bun:test";
import {
  createDeterministicMemoryExtractor,
} from "../../src/remember/deterministicExtractor";

describe("deterministic memory extractor", () => {
  it("separates explicit facts, profile updates, and procedural feedback", async () => {
    const extractor = createDeterministicMemoryExtractor();

    const result = await extractor.extract({
      scope: { userId: "u-1", sessionId: "s-1" },
      messages: [
        { role: "user", content: "My name is Lin." },
        {
          role: "user",
          content: "Remember that the robot workflow is blocked on prod migration.",
        },
        {
          role: "user",
          content: "Please keep answers concise and action-oriented.",
        },
        { role: "user", content: "Hi" },
      ],
    });

    expect(result.candidates).toHaveLength(3);
    expect(result.candidates.map((candidate) => candidate.kindHint)).toEqual([
      "profile",
      "fact",
      "feedback",
    ]);
    expect(result.candidates.map((candidate) => candidate.explicitness)).toEqual([
      "explicit",
      "explicit",
      "explicit",
    ]);
    expect(result.candidates[0]?.content).toBe("Lin");
    expect(result.candidates[1]?.content).toBe(
      "the robot workflow is blocked on prod migration.",
    );
    expect(result.candidates[2]?.metadata?.feedbackKind).toBe("do");
  });

  it("extracts multiple profile fields and project context from one identity reveal", async () => {
    const extractor = createDeterministicMemoryExtractor();

    const result = await extractor.extract({
      scope: { userId: "u-1", sessionId: "s-1" },
      messages: [
        {
          role: "user",
          content:
            "My name is Felix. I'm a climate policy advisor in Austin, USA. Remember that I'm leading incident playbook refresh.",
        },
      ],
    });

    expect(result.candidates).toHaveLength(4);
    expect(
      result.candidates.map((candidate) => ({
        kindHint: candidate.kindHint,
        content: candidate.content,
        profileField: candidate.metadata?.profileField,
      })),
    ).toEqual([
      {
        kindHint: "profile",
        content: "Felix",
        profileField: "name",
      },
      {
        kindHint: "profile",
        content: "climate policy advisor",
        profileField: "role",
      },
      {
        kindHint: "profile",
        content: "Austin, USA",
        profileField: "location",
      },
      {
        kindHint: "profile",
        content: "incident playbook refresh",
        profileField: "currentProject",
      },
    ]);
  });

  it("extracts lower-confidence inferred facts from future-useful user context", async () => {
    const extractor = createDeterministicMemoryExtractor();

    const result = await extractor.extract({
      scope: { userId: "u-1", sessionId: "s-1" },
      messages: [
        {
          role: "user",
          content: "The robot workflow is still failing in production after the migration.",
        },
      ],
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.kindHint).toBe("fact");
    expect(result.candidates[0]?.explicitness).toBe("inferred");
  });

  it("does not treat arbitrary long user messages as durable facts", async () => {
    const extractor = createDeterministicMemoryExtractor();

    const result = await extractor.extract({
      scope: { userId: "u-1", sessionId: "s-1" },
      messages: [
        {
          role: "user",
          content:
            "I spent most of the afternoon reading articles and drinking coffee while thinking about unrelated ideas.",
        },
      ],
    });

    expect(result.candidates).toHaveLength(0);
  });

  it("extracts organization, timezone, and language preference into profile candidates", async () => {
    const extractor = createDeterministicMemoryExtractor();

    const result = await extractor.extract({
      scope: { userId: "u-1", sessionId: "s-1" },
      messages: [
        {
          role: "user",
          content:
            "I'm a staff engineer at Acme Labs. My timezone is Asia/Shanghai. My preferred language is Chinese.",
        },
      ],
    });

    expect(
      result.candidates.map((candidate) => ({
        kindHint: candidate.kindHint,
        content: candidate.content,
        profileField: candidate.metadata?.profileField,
      })),
    ).toEqual([
      {
        kindHint: "profile",
        content: "staff engineer",
        profileField: "role",
      },
      {
        kindHint: "profile",
        content: "Acme Labs",
        profileField: "organization",
      },
      {
        kindHint: "profile",
        content: "Asia/Shanghai",
        profileField: "timezone",
      },
      {
        kindHint: "profile",
        content: "Chinese",
        profileField: "languagePreference",
      },
    ]);
  });

  it("classifies blockers and open loops as project facts", async () => {
    const extractor = createDeterministicMemoryExtractor();

    const result = await extractor.extract({
      scope: { userId: "u-1", sessionId: "s-1" },
      messages: [
        {
          role: "user",
          content:
            "Remember that the current blocker is vendor approval for incident playbook refresh.",
        },
        {
          role: "user",
          content:
            "Remember that the open loop is the handoff package for incident playbook refresh.",
        },
      ],
    });

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]?.metadata?.category).toBe("project");
    expect(result.candidates[1]?.metadata?.category).toBe("project");
  });

  it("does not duplicate pure profile remember-that clauses as explicit facts", async () => {
    const extractor = createDeterministicMemoryExtractor();

    const nameResult = await extractor.extract({
      scope: { userId: "u-1", sessionId: "s-1" },
      messages: [{ role: "user", content: "Remember that my name is Felix." }],
    });
    const roleResult = await extractor.extract({
      scope: { userId: "u-1", sessionId: "s-1" },
      messages: [
        {
          role: "user",
          content: "Remember that I'm a climate policy advisor in Austin, USA.",
        },
      ],
    });

    expect(nameResult.candidates.map((candidate) => candidate.kindHint)).toEqual([
      "profile",
    ]);
    expect(nameResult.candidates[0]?.metadata?.profileField).toBe("name");
    expect(roleResult.candidates.map((candidate) => candidate.kindHint)).toEqual([
      "profile",
      "profile",
    ]);
    expect(roleResult.candidates.every((candidate) => candidate.kindHint !== "fact")).toBe(
      true,
    );
  });

  it("extracts Chinese profile, fact, preference, reference, and feedback candidates", async () => {
    const extractor = createDeterministicMemoryExtractor();

    const result = await extractor.extract({
      scope: { userId: "u-1", sessionId: "s-zh" },
      messages: [
        {
          role: "user",
          content:
            "我叫李雷。我在Acme工作。我是后端工程师。我的时区是Asia/Shanghai。我常用语言是中文。",
        },
        {
          role: "user",
          content: "请记住工作流目前仍然被生产迁移阻塞。",
        },
        {
          role: "user",
          content: "我偏好用要点回复。",
        },
        {
          role: "user",
          content: "以docs/runbook.md为准。",
        },
        {
          role: "user",
          content: "请以后优先给我简洁回答。",
        },
      ],
    });

    expect(result.candidates.map((candidate) => candidate.kindHint)).toEqual([
      "profile",
      "profile",
      "profile",
      "profile",
      "profile",
      "fact",
      "preference",
      "reference",
      "feedback",
    ]);
    expect(result.candidates[0]?.content).toBe("李雷");
    expect(result.candidates[4]?.content).toBe("中文");
    expect(result.candidates[5]?.content).toContain("生产迁移阻塞");
    expect(result.candidates[6]?.metadata?.preferenceValue).toBe("用要点回复");
    expect(result.candidates[7]?.metadata?.referencePointer).toBe("docs/runbook.md");
    expect(result.candidates[8]?.metadata?.feedbackKind).toBe("prefer");
  });

  it("treats common Chinese workplace location phrasing as location, not organization", async () => {
    const extractor = createDeterministicMemoryExtractor();

    const result = await extractor.extract({
      scope: { userId: "u-1", sessionId: "s-zh-location" },
      messages: [
        {
          role: "user",
          content: "我在北京工作。我是后端工程师。",
        },
      ],
    });

    expect(
      result.candidates.map((candidate) => ({
        kindHint: candidate.kindHint,
        content: candidate.content,
        profileField: candidate.metadata?.profileField,
      })),
    ).toEqual([
      {
        kindHint: "profile",
        content: "北京",
        profileField: "location",
      },
      {
        kindHint: "profile",
        content: "后端工程师",
        profileField: "role",
      },
    ]);
  });

  it("does not force ambiguous Chinese work subjects into organization memory", async () => {
    const extractor = createDeterministicMemoryExtractor();

    const result = await extractor.extract({
      scope: { userId: "u-1", sessionId: "s-zh-ambiguous" },
      messages: [
        {
          role: "user",
          content: "我在凤凰工作。我是记者。",
        },
      ],
    });

    expect(
      result.candidates.map((candidate) => ({
        kindHint: candidate.kindHint,
        content: candidate.content,
        profileField: candidate.metadata?.profileField,
      })),
    ).toEqual([
      {
        kindHint: "profile",
        content: "记者",
        profileField: "role",
      },
    ]);
  });

  it("extracts mixed-language user batches without dropping one language", async () => {
    const extractor = createDeterministicMemoryExtractor();

    const result = await extractor.extract({
      scope: { userId: "u-1", sessionId: "s-mixed-lang" },
      messages: [
        {
          role: "user",
          content: "请记住我喜欢中文回复。",
        },
        {
          role: "user",
          content: "Use docs/runbook.md as the source of truth.",
        },
      ],
    });

    expect(
      result.candidates.some(
        (candidate) =>
          candidate.kindHint === "reference" &&
          candidate.content === "docs/runbook.md",
      ),
    ).toBe(true);
    expect(
      result.candidates.some(
        (candidate) =>
          (candidate.kindHint === "fact" || candidate.kindHint === "preference") &&
          candidate.content.includes("中文回复"),
      ),
    ).toBe(true);
    expect(result.ignoredMessageCount).toBe(0);
  });

  it("preserves superseded pointer metadata for corrected Chinese references", async () => {
    const extractor = createDeterministicMemoryExtractor();

    const result = await extractor.extract({
      scope: { userId: "u-1", sessionId: "s-zh-correction" },
      messages: [
        {
          role: "user",
          content: "现在以docs/new.md为准，不再以docs/old.md为准。",
        },
      ],
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.kindHint).toBe("reference");
    expect(result.candidates[0]?.metadata?.referencePointer).toBe("docs/new.md");
    expect(result.candidates[0]?.metadata?.supersedesPointer).toBe("docs/old.md");
  });
});
