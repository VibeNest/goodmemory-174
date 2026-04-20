import type {
  GoodMemory,
  GoodMemoryConfig,
  RecallInput,
  RecallResult,
} from "./contracts";
import { createLanguageService } from "../language";
import type {
  RecallRouterStrategy,
  RetrievalProfile,
} from "../recall/router";
import type {
  RetrievalStrategyRolloutConfig,
} from "../governance/retrievalInternalRollout";
import { assertRetrievalPromotionAuthorizationAllowsDefaultRollout } from "../governance/retrievalInternalRollout";

interface InternalRetrievalRolloutState {
  assistedRecallRouterEnabled: boolean;
  config: GoodMemoryConfig;
  now?: () => Date;
  rollout?: RetrievalStrategyRolloutConfig;
}

function resolveRequestedStrategy(
  input: RecallInput,
): RecallRouterStrategy {
  return input.strategy ?? "auto";
}

function buildPromotedSummary(input: {
  requestedStrategy: "auto" | RecallInput["strategy"];
}): string {
  const requestedLabel = input.requestedStrategy ?? "auto";
  return `internal promote rollout elevated ${requestedLabel} recall to llm-assisted for an authorized high-value query while preserving the rules-first floor.`;
}

function isHighValueRecallQuery(input: {
  languageService: ReturnType<typeof createLanguageService>;
  locale?: string;
  query: string;
  retrievalProfile?: RetrievalProfile;
}): boolean {
  const locale =
    input.locale ??
    input.languageService.resolveFromText({
      text: input.query,
    }).locale;

  const retrievalProfile = input.retrievalProfile ?? "general_chat";
  if (retrievalProfile === "coding_agent") {
    return true;
  }

  const continuation = input.languageService.isContinuationQuery(
    input.query,
    locale,
  );
  const blocker = input.languageService.isBlockerQuery(input.query, locale);
  const openLoop = input.languageService.isOpenLoopQuery(input.query, locale);
  const referenceSeeking = input.languageService.isReferenceSeekingQuery(
    input.query,
    locale,
  );
  const actionDriving = input.languageService.isActionDrivingQuery(
    input.query,
    locale,
  );

  return continuation || blocker || openLoop || referenceSeeking || actionDriving;
}

function shouldApplyInternalRetrievalPromotion(input: {
  languageService: ReturnType<typeof createLanguageService>;
  recallInput: RecallInput;
  rollout?: RetrievalStrategyRolloutConfig;
}): boolean {
  const rollout = input.rollout;
  if (!rollout) {
    return false;
  }

  const mode = rollout.mode ?? "promote";
  const promotedStrategy = rollout.promotedStrategy ?? "rules-only";
  if (mode !== "promote" || promotedStrategy !== "llm-assisted") {
    return false;
  }

  if (input.recallInput.strategy && input.recallInput.strategy !== "auto") {
    return false;
  }

  return isHighValueRecallQuery({
    languageService: input.languageService,
    locale: input.recallInput.locale,
    query: input.recallInput.query,
    retrievalProfile: input.recallInput.retrievalProfile,
  });
}

function patchPromotedRecallResult(input: {
  originalInput: RecallInput;
  result: RecallResult;
}): RecallResult {
  const requestedStrategy = resolveRequestedStrategy(input.originalInput);

  input.result.metadata.routingDecision.strategyExplanation = {
    ...input.result.metadata.routingDecision.strategyExplanation,
    requestedStrategy,
    summary: buildPromotedSummary({
      requestedStrategy,
    }),
  };

  return input.result;
}

export function wrapInternalRetrievalRolloutMemory(
  memory: GoodMemory,
  state: InternalRetrievalRolloutState,
): GoodMemory {
  if (!state.rollout) {
    return memory;
  }

  const mode = state.rollout.mode ?? "promote";
  const promotedStrategy = state.rollout.promotedStrategy ?? "rules-only";
  if (mode === "promote" && promotedStrategy === "llm-assisted") {
    if (!state.assistedRecallRouterEnabled) {
      throw new Error(
        "Internal retrieval rollout promoting llm-assisted requires assisted recall router support.",
      );
    }

    assertRetrievalPromotionAuthorizationAllowsDefaultRollout({
      now: state.now?.().toISOString(),
      rollout: state.rollout,
    });
  }

  const languageService = createLanguageService(state.config.language);

  return {
    async buildContext(input) {
      return memory.buildContext(input);
    },
    async deleteAllMemory(input) {
      return memory.deleteAllMemory(input);
    },
    async exportMemory(input) {
      return memory.exportMemory(input);
    },
    async feedback(input) {
      return memory.feedback(input);
    },
    async forget(input) {
      return memory.forget(input);
    },
    async recall(input) {
      const promotionApplied = shouldApplyInternalRetrievalPromotion({
        languageService,
        recallInput: input,
        rollout: state.rollout,
      });

      if (promotionApplied) {
        assertRetrievalPromotionAuthorizationAllowsDefaultRollout({
          now: state.now?.().toISOString(),
          rollout: state.rollout,
        });
      }

      const effectiveInput = promotionApplied
        ? {
            ...input,
            strategy: "llm-assisted" as const,
          }
        : input;
      const result = await memory.recall(effectiveInput);

      if (!promotionApplied) {
        return result;
      }

      return patchPromotedRecallResult({
        originalInput: input,
        result,
      });
    },
    async remember(input) {
      return memory.remember(input);
    },
    async runMaintenance(input) {
      return memory.runMaintenance(input);
    },
  };
}
