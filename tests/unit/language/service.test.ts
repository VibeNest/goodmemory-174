import { describe, expect, it } from "bun:test";
import { createLanguageService } from "../../../src/language";

describe("language service", () => {
  it("prefers explicit locale over detection", () => {
    const service = createLanguageService({
      defaultLocale: "en-US",
    });

    const resolved = service.resolveFromText({
      locale: "zh-CN",
      text: "Please keep answers concise.",
    });

    expect(resolved.locale).toBe("zh-CN");
    expect(resolved.localeSource).toBe("explicit");
    expect(resolved.adapterId).toBe("zh");
  });

  it("detects Chinese automatically when no locale is provided", () => {
    const service = createLanguageService();

    const resolved = service.resolveFromText({
      text: "请记住我喜欢中文回复。",
    });

    expect(resolved.locale).toBe("zh-CN");
    expect(resolved.localeSource).toBe("detected");
    expect(resolved.adapterId).toBe("zh");
  });

  it("keeps Chinese locale when the sentence mixes Han text with ASCII paths", () => {
    const service = createLanguageService();

    const resolved = service.resolveFromText({
      text: "以docs/runbook.md为准。",
    });

    expect(resolved.locale).toBe("zh-CN");
    expect(resolved.adapterId).toBe("zh");
  });

  it("keeps Chinese content during normalization and tokenization", () => {
    const service = createLanguageService();
    const resolved = service.resolveFromText({
      text: "请记住我喜欢中文回复。",
    });

    expect(service.normalizeForEquality("请记住我喜欢中文回复。", resolved)).toBe(
      "请记住我喜欢中文回复",
    );
    expect(service.tokenize("请记住我喜欢中文回复。", resolved)).not.toHaveLength(0);
  });

  it("supports Chinese query intent and polarity detection", () => {
    const service = createLanguageService();

    expect(service.isAnswerCompositionQuery("我应该怎么回复这个用户？", "zh-CN")).toBe(true);
    expect(service.isContinuationQuery("继续上次的工作流修复。", "zh-CN")).toBe(true);
    expect(service.detectFactPolarity("工作流仍然被阻塞。", "zh-CN")).toBe("negative");
    expect(service.detectFactPolarity("工作流已经稳定。", "zh-CN")).toBe("positive");
  });

  it("classifies Chinese feedback signals", () => {
    const service = createLanguageService();

    expect(service.deriveFeedbackKind("请以后优先用要点回答。", "zh-CN")).toBe("prefer");
    expect(service.deriveFeedbackKind("不要展开太多背景。", "zh-CN")).toBe("dont");
    expect(service.deriveFeedbackKind("这个格式对我很有用，继续这样做。", "zh-CN")).toBe(
      "validated_pattern",
    );
  });

  it("recognizes Chinese assistant acknowledgements and unresolved signals", () => {
    const service = createLanguageService();

    expect(service.isAssistantAcknowledgement("好的。", "zh-CN")).toBe(true);
    expect(service.isAssistantContinuitySignal("我会继续跟进这个阻塞。", "zh-CN")).toBe(true);
    expect(service.isUnresolvedSignal("这个问题后续还要继续跟进。", "zh-CN")).toBe(true);
  });
});
