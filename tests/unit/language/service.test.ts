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

  it("keeps short English content tokens such as acronyms and codes", () => {
    const service = createLanguageService();
    const resolved = service.resolveFromText({ text: "RL and AI work in SF." });

    const tokens = service.tokenize("RL and AI work in SF.", resolved, {
      excludeStopwords: true,
    });
    expect(tokens).toContain("rl");
    expect(tokens).toContain("ai");
    expect(tokens).toContain("sf");
    expect(tokens).not.toContain("and");
    expect(tokens).not.toContain("in");

    // Without stopword exclusion the function words stay available to callers
    // that want raw tokens.
    const rawTokens = service.tokenize("RL and AI work in SF.", resolved);
    expect(rawTokens).toContain("and");
    expect(rawTokens).toContain("in");
  });

  it("keeps the naive overlap signal on its calibrated length floor", () => {
    const service = createLanguageService();

    // Short tokens stay out of the Jaccard overlap on purpose: its max
    // denominator would let them dilute every calibrated score. Short-token
    // matching is the BM25/fusion channels' job.
    const shortOnly = service.tokenOverlap(
      "Marco is learning RL for robot control.",
      "What is RL used for?",
      "en-US",
      { excludeStopwords: true },
    );
    expect(shortOnly).toBe(0);

    // Anti-dilution guard: adding short content words to one side must not
    // change an established overlap score.
    const base = service.tokenOverlap(
      "avoid DeepAnalyzer first",
      "please avoid DeepAnalyzer",
      "en-US",
      { excludeStopwords: true },
    );
    const diluted = service.tokenOverlap(
      "avoid DeepAnalyzer first and use it",
      "please avoid DeepAnalyzer",
      "en-US",
      { excludeStopwords: true },
    );
    expect(base).toBeGreaterThan(0);
    expect(diluted).toBe(base);
  });

  it("supports Chinese query intent and polarity detection", () => {
    const service = createLanguageService();

    expect(service.isAnswerCompositionQuery("我应该怎么回复这个用户？", "zh-CN")).toBe(true);
    expect(service.isAnswerCompositionQuery("请总结当前发布状态。", "zh-CN")).toBe(true);
    expect(service.isContinuationQuery("继续上次的工作流修复。", "zh-CN")).toBe(true);
    expect(service.isActionDrivingQuery("请使用这些记忆决定下一步。", "zh-CN")).toBe(true);
    expect(service.isActionDrivingQuery("我应该用哪个工作流文档？", "zh-CN")).toBe(false);
    expect(service.isRoleQuery("我当前的角色是什么？", "zh-CN")).toBe(true);
    expect(service.isBlockerQuery("当前阻塞是什么？", "zh-CN")).toBe(true);
    expect(service.isRoleFact("我当前角色是平台工程负责人。", "zh-CN")).toBe(true);
    expect(service.isBlockerFact("当前阻塞是供应商审批。", "zh-CN")).toBe(true);
    expect(service.detectFactPolarity("工作流仍然被阻塞。", "zh-CN")).toBe("negative");
    expect(service.detectFactPolarity("工作流已经稳定。", "zh-CN")).toBe("positive");
  });

  it("supports Chinese recall selection query families", () => {
    const service = createLanguageService();

    expect(service.isGuidanceSeekingQuery("以后回复有什么格式要求？", "zh-CN")).toBe(true);
    expect(service.isDirectFactualLookupQuery("我上次买了什么？", "zh-CN")).toBe(true);
    expect(service.isAggregateCountQuery("这些维修总共花了多少钱？", "zh-CN")).toBe(true);
    expect(service.isRecommendationStyleQuery("厨房又乱了，有什么建议？", "zh-CN")).toBe(true);
    expect(service.isAssistantEvidenceRecallQuery("你之前给我的清单里第七项是什么？", "zh-CN")).toBe(true);
    expect(service.isPersonalEvidenceSignal("我家的水龙头有点漏水。", "zh-CN")).toBe(true);
    expect(service.isPreferenceEvidenceSignal("我想要更安静的晚上活动。", "zh-CN")).toBe(true);
  });

  it("supports English slot-scoped query and fact intents", () => {
    const service = createLanguageService();

    expect(service.isRoleQuery("What is my current role?", "en-US")).toBe(true);
    expect(
      service.isRoleQuery(
        "When is the deadline for submitting my application for the senior producer role at Montserrat Media Corp?",
        "en-US",
      ),
    ).toBe(false);
    expect(
      service.isRoleQuery(
        "What was the age and role of the mentor who suggested I attend the workshop?",
        "en-US",
      ),
    ).toBe(false);
    expect(service.isFocusQuery("What is my current focus?", "en-US")).toBe(true);
    expect(service.isOpenLoopQuery("What is the open loop right now?", "en-US")).toBe(
      true,
    );
    expect(
      service.isOpenLoopQuery(
        "How many items do I need to pick up or return from a store?",
        "en-US",
      ),
    ).toBe(true);
    expect(
      service.isOpenLoopQuery(
        "I got a message that I need to verify my identity; what do I do?",
        "en-US",
      ),
    ).toBe(false);
    expect(
      service.isContinuationQuery(
        "How many items do I need to pick up or return from a store?",
        "en-US",
      ),
    ).toBe(false);
    expect(
      service.isContinuationQuery("Let's pick up where we left off.", "en-US"),
    ).toBe(true);
    expect(service.isBlockerQuery("What is the current blocker?", "en-US")).toBe(
      true,
    );
    expect(service.isActionDrivingQuery("Use this memory to decide the next step.", "en-US")).toBe(
      true,
    );
    expect(service.isAnswerCompositionQuery("Please summarize the current rollout status.", "en-US")).toBe(
      true,
    );
    expect(
      service.isAggregateCountQuery(
        "How much total money have I spent on repairs?",
        "en-US",
      ),
    ).toBe(true);
    expect(
      service.isAggregateCountQuery(
        "How did Rowan describe the time spent restoring telescopes with volunteers?",
        "en-US",
      ),
    ).toBe(false);
    expect(
      service.isAggregateCountQuery(
        "What did I spend in total on the workshop?",
        "en-US",
      ),
    ).toBe(true);
    expect(
      service.isAggregateCountQuery(
        "Add up what I spent on the two prototypes.",
        "en-US",
      ),
    ).toBe(true);
    expect(service.isActionDrivingQuery("Which workflow doc should I use?", "en-US")).toBe(
      false,
    );
    expect(
      service.isRoleFact(
        "my current role is staff platform engineer leading runtime reliability.",
        "en-US",
      ),
    ).toBe(true);
    expect(
      service.isRoleFact(
        "I am a robotics engineer in Shanghai leading the migration rollout.",
        "en-US",
      ),
    ).toBe(true);
    expect(
      service.isFocusFact("my current focus is stabilizing release workflows.", "en-US"),
    ).toBe(true);
    expect(
      service.isFocusFact("I am leading the migration rollout.", "en-US"),
    ).toBe(true);
    expect(service.isOpenLoopFact("The open loop is pending signoff.", "en-US")).toBe(
      true,
    );
    expect(service.isOpenLoopFact("I need to return some boots to Zara.", "en-US")).toBe(
      true,
    );
    expect(
      service.isBlockerFact("The current blocker is vendor approval.", "en-US"),
    ).toBe(true);
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
