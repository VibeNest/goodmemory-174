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
      answer: /(怎么回复|如何回复|如何回答|怎么回答|给用户回复|回答这个用户)/u,
      reference: /(手册|文档|参考|以什么为准|来源|规范|流程)/u,
      role: /(角色|身份|职位)/u,
      focus: /(重点|当前重点|当前关注|关注点)/u,
      openLoop: /(开环|待办|未完成|签收|验收|验证)/u,
      blocker: /(阻塞|卡在哪里|卡住|审批)/u,
      projectState: /(项目|流程|迁移|审批|阻塞|卡在哪里|卡住|开环|待办|签收|验收)/u,
      confirm: /(确认)/u,
      factConfirmationTarget: /(角色|身份|职位|重点|关注|开环|待办|阻塞|审批|签收|验收|验证)/u,
      actionDriving: /(发送|发布|上线|决定|执行|推进|下一步|部署|迁移方案)/u,
      continuation: /(继续|接着|延续|上次|从上次|继续做|接着做|继续这个)/u,
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
      blockerFact: /(阻塞|卡住|审批)/u,
    };
  }

  return {
    answer: /\b(answer|respond|reply|user)\b/i,
    reference: /\b(runbook|guide|doc|docs|reference|source of truth|workflow)\b/i,
    role: /\brole\b/i,
    focus: /\bfocus\b/i,
    openLoop: /\b(open loop|handoff|signoff|verification)\b/i,
    blocker: /\b(blocker|blocked|blocking|approval)\b/i,
    projectState: /\b(project|workflow|migration|rollout|approval|blocker|blocked|open loop|handoff|signoff|verification|prod|production)\b/i,
    confirm: /\bconfirm\b/i,
    factConfirmationTarget:
      /\b(role|focus|open loop|blocker|handoff|approval|package|signoff|verification)\b/i,
    actionDriving:
      /\b(proceed|send|ship|deploy|decide|rollout|execute|migration plan|next step)\b/i,
    continuation: /\b(continue|resume|last time|from last time|carry on|pick up)\b/i,
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
      openLoopFact: /\bopen loop\b/i,
      blockerFact: /\bblocker\b|\bblocked\b|\bblocking\b|\bapproval\b/i,
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
      return createQueryPatterns(contextLocale(context)).role.test(query);
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
    isContinuationQuery(query, context) {
      return createQueryPatterns(contextLocale(context)).continuation.test(query);
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
      return patterns.openLoopFact.test(content) || patterns.blockerFact.test(content);
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
