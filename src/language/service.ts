import type { FeedbackKind } from "../domain/records";
import type {
  LanguageConfig,
  LanguageService,
  ResolvedLanguageContext,
  LocaleDetector,
  LanguageAdapter,
} from "./contracts";
import { createChineseLanguageAdapter } from "./chinese";
import { createEnglishLanguageAdapter } from "./english";
import {
  containsHanScript,
  createGenericLanguageAdapter,
} from "./generic";

const BUILTIN_SPECIALIZED_ADAPTERS = [
  createChineseLanguageAdapter(),
  createEnglishLanguageAdapter(),
];
const FALLBACK_ADAPTER = createGenericLanguageAdapter();

function primaryLanguage(locale: string): string {
  return locale.toLowerCase().split("-")[0] ?? locale.toLowerCase();
}

function defaultLocaleDetector(input: {
  texts: string[];
  defaultLocale?: string;
}): string | undefined {
  const joined = input.texts.join(" ");
  if (!joined.trim()) {
    return input.defaultLocale;
  }

  const hanMatches = joined.match(/\p{Script=Han}/gu)?.length ?? 0;
  const latinMatches = joined.match(/\p{Script=Latin}/gu)?.length ?? 0;

  if (hanMatches > 0) {
    return "zh-CN";
  }

  if (latinMatches > 0) {
    return "en-US";
  }

  return input.defaultLocale;
}

function mergeCustomAdapters(
  adapters: LanguageAdapter[] | undefined,
): LanguageAdapter[] {
  if (!adapters || adapters.length === 0) {
    return [...BUILTIN_SPECIALIZED_ADAPTERS];
  }

  const merged = [...adapters];
  for (const builtin of BUILTIN_SPECIALIZED_ADAPTERS) {
    if (!merged.some((adapter) => adapter.id === builtin.id)) {
      merged.push(builtin);
    }
  }

  return merged;
}

function resolveAdapter(
  locale: string,
  adapters: LanguageAdapter[],
): LanguageAdapter {
  return (
    adapters.find((adapter) => adapter.supportsLocale(locale)) ??
    FALLBACK_ADAPTER
  );
}

function contextLocale(
  context: ResolvedLanguageContext | string,
): string {
  return typeof context === "string" ? context : context.locale;
}

function contextAdapter(
  context: ResolvedLanguageContext | string,
  adapters: LanguageAdapter[],
): LanguageAdapter {
  return typeof context === "string"
    ? resolveAdapter(context, adapters)
    : context.adapter;
}

function createQueryPatterns(locale: string) {
  if (primaryLanguage(locale) === "zh") {
    return {
      answer: /(怎么回复|如何回复|如何回答|怎么回答|给用户回复|回答这个用户|总结|摘要|概述|汇总)/u,
      reference: /(手册|runbook|文档|参考|以什么为准|以哪个[^。！？?]*为准|来源|规范|流程)/u,
      role: /(角色|身份|职位)/u,
      focus: /(重点|当前重点|当前关注|关注点)/u,
      openLoop: /(开环|待办|未完成|签收|验收|验证)/u,
      blocker: /(阻塞|卡点|卡在哪里|卡住|审批)/u,
      projectState: /(项目|流程|迁移|审批|阻塞|卡点|卡在哪里|卡住|开环|待办|签收|验收)/u,
      confirm: /(确认)/u,
      factConfirmationTarget: /(角色|身份|职位|重点|关注|开环|待办|阻塞|卡点|审批|签收|验收|验证)/u,
      actionDriving: /(发送|发布|上线|决定|执行|推进|下一步|部署|迁移方案)/u,
      aggregateCount: /(多少|几个|几件|几项|总共|合计|一共|多少钱|花了多少钱|花费多少)/u,
      assistantEvidenceRecall:
        /(之前|上次|刚才|前面|你(?:告诉|说|建议|推荐|提供)|清单|列表|第[一二三四五六七八九十\d]+项|提醒我)/u,
      continuation: /(继续|接着|延续|上次|从上次|继续做|接着做|继续这个)/u,
      directFactualLookup:
        /^(谁|什么|哪里|哪儿|何时|什么时候|多久|多少|几个|几件|几项|哪个|哪一个|是否|是不是|我是否|我是不是|我上次|上次|之前)/u,
      guidanceSeeking: /(偏好|喜欢|风格|格式|语气|规则|要求|指令|怎么回复|如何回复|如何回答|怎么回答)/u,
      personalEvidence: /(我|我的|我家|我们|我们的|自己|家里|家中)/u,
      preferenceEvidence:
        /(偏好|更喜欢|喜欢|想要|想|希望|需要|在找|感兴趣|不想|讨厌|困扰|问题|麻烦|漏水|刮痕|划痕|维修|收纳|乱|杂乱)/u,
      recommendationStyle:
        /(推荐|建议|意见|主意|想法|技巧|提示|怎么处理|如何处理|怎么做|怎么办|有什么建议|有什么办法|该怎么)/u,
      positive: /(稳定|已解决|关闭|修复|完成)/u,
      negative: /(阻塞|失败|打开|不稳定|卡住|未完成)/u,
      validated: /(有效|有帮助|很好用|继续这样|保持这样|这样做得好|这个格式对我很有用)/u,
      dont: /(不要|别|禁止)/u,
      prefer: /(偏好|更喜欢|优先)/u,
      assistantAck:
        /^(好的|收到|明白|知道了|行|可以|没问题|记住了|已记录|已更新|好)\.?[。！!]?$/u,
      assistantContinuity:
        /(会|继续|接下来|跟进|保持|下一步|待办|阻塞|已更新|确认)/u,
      unresolved:
        /(待办|阻塞|未完成|剩余|后续|跟进|下一步|以后处理|待确认)/u,
      roleFact: /(我当前角色是|我的角色是)/u,
      focusFact: /(我当前重点是|当前重点是)/u,
      openLoopFact: /(开环|待办|未完成|签收|验收|验证)/u,
      blockerFact: /(阻塞|卡点|卡住|审批)/u,
      projectStateFact: /(待确认|待处理|待跟进|待完成|待评审|仍需|还需|剩余|尚待|待 review)/u,
    };
  }

  return {
    answer: /\b(answer|respond|reply|user|summari[sz]e|summary|compose|draft)\b/i,
    reference: /\b(runbook|guide|doc|docs|reference|source of truth)\b/i,
    role: /\brole\b/i,
    focus: /\bfocus\b/i,
    openLoop:
      /\b(open loop|handoff|signoff|verification|todo|to-do|need to|have to|pick up)\b|\bhow many\b.*\breturn\b/i,
    blocker: /\b(blocker|blocked|blocking|approval)\b/i,
    projectState: /\b(project|workflow|migration|rollout|approval|blocker|blocked|open loop|handoff|signoff|verification|prod|production)\b/i,
    confirm: /\bconfirm\b/i,
    factConfirmationTarget:
      /\b(role|focus|open loop|blocker|handoff|approval|package|signoff|verification)\b/i,
      actionDriving:
        /\b(proceed|send|ship|deploy|decide|rollout|execute|migration plan|next step|do next)\b/i,
    aggregateCount:
      /\bhow many\b|\bhow much\b|\b(?:total money|spent|spend|cost|costs|paid|price|dollars?)\b/i,
    assistantEvidenceRecall:
      /\b(?:previous|earlier|last time|talked about|discussed|you (?:told|said|suggested|recommended|provided)|list you provided|remind me)\b/i,
    continuation:
      /\b(continue|resume|last time|from last time|carry on)\b|\bpick up\s+(?:where we left off|from last time|this thread|the thread|this task|the task)\b/i,
    directFactualLookup:
      /^(?:who|where|when|which|what|did|do|does|was|were|is|are|am|can you remind me|remind me)\b|^how\s+(?:much|many|long|old|far|often)\b/i,
    guidanceSeeking:
      /\b(prefer|preference|style|tone|format|guidance|rule|rules|instruction|instructions|respond|reply|how should|should i|should you|should be|avoid|do not|don't|remember to)\b/i,
    personalEvidence: /\b(?:i|my|me|mine|i'm|i've|i'd)\b/i,
    preferenceEvidence:
      /\b(?:prefer|like|love|enjoy|want|looking for|interested in|miss|struggling|trying to|issue|issues|problem|problems|leak|leaking|scratch|scratches|clutter|clutter-free)\b/i,
    recommendationStyle:
      /\b(?:recommend|suggest(?:ions?)?|advice|ideas?|tips?|what should|what can i|where should)\b/i,
    positive: /\b(stable|resolved|closed|fixed)\b/i,
    negative: /\b(blocked|failing|open|unstable)\b/i,
    validated: /\b(worked well|keep using|effective|successful)\b/i,
    dont: /\b(don't|do not)\b/i,
    prefer: /\b(prefer)\b/i,
    assistantAck:
      /^(understood|noted|captured|okay|ok|will do|done|thanks|thank you|updated)\.?$/i,
      assistantContinuity:
        /\b(will|going forward|use|continue|updated|confirm|propos|next step|resolved|pending|blocked|follow up|keep)\b/i,
      unresolved:
        /\b(open loop|blocked|pending|remaining|follow up|follow-up|todo|next step)\b/i,
      roleFact:
        /\bmy current role is\b|\bi(?:'m| am)\s+(?:an?|the)\s+.+\b(?:at|leading|working on|focused on|owning)\b/i,
      focusFact:
        /\bmy current focus is\b|\bi(?:'m| am)\s+(?:leading|working on|focused on|owning)\b/i,
      openLoopFact:
        /\bopen loop\b|\bi\s+(?:(?:still|also|just)\s+)?(?:need|have)\s+to\b|\bi(?:'ve| have)\s+been\s+meaning\s+to\b/i,
      blockerFact: /\bblocker\b|\bblocked\b|\bblocking\b|\bapproval\b/i,
      projectStateFact:
        /\b(next milestone|next step|next action|upcoming milestone|pending|waiting|remaining|still needs?|needs? review|needs? confirmation|needs? follow(?:-| )?up)\b/i,
    };
  }

export function createLanguageService(
  config: LanguageConfig = {},
): LanguageService {
  const detectionMode = config.detection ?? "auto";
  const defaultLocale = config.defaultLocale ?? "en-US";
  const detector: LocaleDetector =
    config.detector ??
    ((input) =>
      defaultLocaleDetector({
        texts: input.texts,
        defaultLocale: input.defaultLocale,
      }));
  const adapters = mergeCustomAdapters(config.adapters);

  const resolveLocale = (input: {
    locale?: string;
    texts: string[];
  }): ResolvedLanguageContext => {
    if (input.locale) {
      const adapter = resolveAdapter(input.locale, adapters);
      return {
        locale: input.locale,
        localeSource: "explicit",
        adapter,
        adapterId: adapter.id,
        analysisMode: "rules-only",
      };
    }

    if (detectionMode === "explicit_first" && defaultLocale) {
      const adapter = resolveAdapter(defaultLocale, adapters);
      return {
        locale: defaultLocale,
        localeSource: "default",
        adapter,
        adapterId: adapter.id,
        analysisMode: "rules-only",
      };
    }

    const detected = detector({
      explicitLocale: input.locale,
      texts: input.texts,
      defaultLocale,
    });
    if (detected) {
      const adapter = resolveAdapter(detected, adapters);
      return {
        locale: detected,
        localeSource: "detected",
        adapter,
        adapterId: adapter.id,
        analysisMode: "rules-only",
      };
    }

    const adapter = resolveAdapter(defaultLocale, adapters);
    return {
      locale: defaultLocale,
      localeSource: "default",
      adapter,
      adapterId: adapter.id,
      analysisMode: "rules-only",
    };
  };

  return {
    resolveFromMessages(input) {
      return resolveLocale({
        locale: input.locale,
        texts: input.messages.map((message) => message.content),
      });
    },
    resolveFromText(input) {
      return resolveLocale({
        locale: input.locale,
        texts: [input.text],
      });
    },
    normalizeForEquality(text, context) {
      return contextAdapter(context, adapters).normalizeForEquality(text);
    },
    tokenize(text, context, options) {
      return contextAdapter(context, adapters).tokenize(text, options);
    },
    splitClauses(text, context) {
      return contextAdapter(context, adapters).splitClauses(text);
    },
    tokenOverlap(left, right, context, options) {
      const leftTokens = new Set(this.tokenize(left, context, options));
      const rightTokens = new Set(this.tokenize(right, context, options));

      if (leftTokens.size === 0 || rightTokens.size === 0) {
        return 0;
      }

      let intersection = 0;
      for (const token of leftTokens) {
        if (rightTokens.has(token)) {
          intersection += 1;
        }
      }

      return intersection / Math.max(leftTokens.size, rightTokens.size);
    },
    localesCompatible(left, right) {
      return primaryLanguage(left) === primaryLanguage(right);
    },
    isAnswerCompositionQuery(query, context) {
      return createQueryPatterns(contextLocale(context)).answer.test(query);
    },
    isReferenceSeekingQuery(query, context) {
      return createQueryPatterns(contextLocale(context)).reference.test(query);
    },
    isRoleQuery(query, context) {
      const locale = contextLocale(context);
      if (
        primaryLanguage(locale) === "en" &&
        /\brole\b/iu.test(query) &&
        (
          /\b(?:application|deadline|submitting|submission)\b/iu.test(query) ||
          /\b(?:age\s+and\s+role\s+of|role\s+of\s+the\s+mentor)\b/iu.test(query)
        )
      ) {
        return false;
      }

      return createQueryPatterns(locale).role.test(query);
    },
    isFocusQuery(query, context) {
      return createQueryPatterns(contextLocale(context)).focus.test(query);
    },
    isOpenLoopQuery(query, context) {
      return createQueryPatterns(contextLocale(context)).openLoop.test(query);
    },
    isBlockerQuery(query, context) {
      return createQueryPatterns(contextLocale(context)).blocker.test(query);
    },
    isProjectStateQuery(query, context) {
      return createQueryPatterns(contextLocale(context)).projectState.test(query);
    },
    isFactConfirmationQuery(query, context) {
      const patterns = createQueryPatterns(contextLocale(context));
      return (
        patterns.role.test(query) ||
        patterns.focus.test(query) ||
        patterns.openLoop.test(query) ||
        patterns.blocker.test(query) ||
        (patterns.confirm.test(query) && patterns.factConfirmationTarget.test(query))
      );
    },
    isActionDrivingQuery(query, context) {
      return createQueryPatterns(contextLocale(context)).actionDriving.test(query);
    },
    isAggregateCountQuery(query, context) {
      return createQueryPatterns(contextLocale(context)).aggregateCount.test(query);
    },
    isAssistantEvidenceRecallQuery(query, context) {
      return createQueryPatterns(contextLocale(context)).assistantEvidenceRecall.test(
        query,
      );
    },
    isContinuationQuery(query, context) {
      return createQueryPatterns(contextLocale(context)).continuation.test(query);
    },
    isDirectFactualLookupQuery(query, context) {
      const normalized = query.trim().replace(/\s+/gu, " ");
      return normalized.length > 0 &&
        createQueryPatterns(contextLocale(context)).directFactualLookup.test(
          normalized,
        );
    },
    isGuidanceSeekingQuery(query, context) {
      return createQueryPatterns(contextLocale(context)).guidanceSeeking.test(query);
    },
    isRecommendationStyleQuery(query, context) {
      return createQueryPatterns(contextLocale(context)).recommendationStyle.test(
        query,
      );
    },
    isRoleFact(content, context) {
      return createQueryPatterns(contextLocale(context)).roleFact.test(content);
    },
    isFocusFact(content, context) {
      return createQueryPatterns(contextLocale(context)).focusFact.test(content);
    },
    isOpenLoopFact(content, context) {
      return createQueryPatterns(contextLocale(context)).openLoopFact.test(content);
    },
    isBlockerFact(content, context) {
      return createQueryPatterns(contextLocale(context)).blockerFact.test(content);
    },
    isProjectStateFact(content, context) {
      const patterns = createQueryPatterns(contextLocale(context));
      return patterns.projectStateFact.test(content);
    },
    isPersonalEvidenceSignal(content, context) {
      return createQueryPatterns(contextLocale(context)).personalEvidence.test(content);
    },
    isPreferenceEvidenceSignal(content, context) {
      return createQueryPatterns(contextLocale(context)).preferenceEvidence.test(
        content,
      );
    },
    detectFactPolarity(content, context) {
      const patterns = createQueryPatterns(contextLocale(context));
      if (patterns.negative.test(content)) {
        return "negative";
      }

      if (patterns.positive.test(content)) {
        return "positive";
      }

      return "unknown";
    },
    isAssistantAcknowledgement(content, context) {
      return createQueryPatterns(contextLocale(context)).assistantAck.test(content.trim());
    },
    isAssistantContinuitySignal(content, context) {
      return createQueryPatterns(contextLocale(context)).assistantContinuity.test(
        content,
      );
    },
    isUnresolvedSignal(content, context) {
      return createQueryPatterns(contextLocale(context)).unresolved.test(content);
    },
    deriveFeedbackKind(signal, context): FeedbackKind {
      const patterns = createQueryPatterns(contextLocale(context));

      if (patterns.validated.test(signal)) {
        return "validated_pattern";
      }

      if (patterns.dont.test(signal)) {
        return "dont";
      }

      if (patterns.prefer.test(signal)) {
        return "prefer";
      }

      if (primaryLanguage(contextLocale(context)) === "zh" && containsHanScript(signal)) {
        return "do";
      }

      return "do";
    },
  };
}
