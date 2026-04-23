import { buildEpisodeEmbeddingWrite } from "../embedding/vectorWrites";
import {
  createLanguageService,
  type LanguageService,
} from "../language";
import type { PolicyContext } from "../policy/hooks";
import { createDeterministicMemoryExtractor } from "./deterministicExtractor";
import { maybeBuildEpisode } from "./episodes";
import {
  annotateExtractionResult,
  dedupeExtractionResult,
  mergeExtractionResults,
} from "./extraction";
import { writeRememberCandidate } from "./handlers";
import {
  classifyCandidate,
  buildRememberEventTrace,
  toRememberEventMemoryType,
} from "./classification";
import type {
  MessageAnnotation,
  MemoryCandidate,
  MemoryExtractionInput,
  MemoryExtractionResult,
  MemoryExtractionStrategy,
} from "./candidates";
import type {
  RememberEngineConfig,
  RememberResult,
  RollbackAction,
  RememberWriteState,
} from "./contracts";
import {
  createRuleMemoryExtractor,
  resolveRememberProfile,
  type ResolvedRememberProfile,
} from "./profiles";
import {
  extractCanonicalReferencePointer,
  normalizeMemoryCandidate,
} from "./normalization";
import { commitRememberVectors, rollbackRememberWrites } from "./vectorOps";

export type {
  ClassifiedCandidate,
  RememberEngineConfig,
  RememberEvent,
  RememberResult,
} from "./contracts";

export function createRememberEngine(config: RememberEngineConfig) {
  const AUTO_EXTRACTION_COMPLEXITY_CHAR_THRESHOLD = 220;
  const AUTO_EXTRACTION_COMPLEX_BATCH_THRESHOLD = 4;
  const AUTO_EXTRACTION_DURABLE_CUE_PATTERN =
    /\b(remember that|source of truth|runbook|current blocker|blocked|blocking|prefer|please keep|my current role|my role|my timezone|preferred language|current focus|current project|use .+ instead of|instead of)\b|记住|以.+为准|阻塞|卡点|不再/u;
  const language = config.language ?? createLanguageService();
  const extractor =
    config.extractor ??
    createDeterministicMemoryExtractor({
      service: language,
    });
  const assistedExtractor = config.assistedExtractor;
  const now = config.now ?? (() => new Date().toISOString());
  const createId = config.createId ?? (() => crypto.randomUUID());
  const vectorIndex =
    config.vectorIndex !== undefined
      ? config.vectorIndex ?? null
      : config.repositories.vectorIndex ?? null;

  const findAnnotation = (
    input: MemoryExtractionInput,
    messageIndex: number,
  ): MessageAnnotation | undefined =>
    input.annotations?.find((annotation) => annotation.messageIndex === messageIndex);

  const buildAnnotationTrace = (annotation: MessageAnnotation) => {
    if (
      annotation.remember === undefined &&
      annotation.confirmed !== true &&
      annotation.verified !== true &&
      annotation.kindHint === undefined &&
      annotation.metadataPatch === undefined &&
      !annotation.reason
    ) {
      return undefined;
    }

    return {
      ...(annotation.confirmed === true ? { confirmed: true } : {}),
      ...(annotation.kindHint ? { kindHint: annotation.kindHint } : {}),
      ...(annotation.metadataPatch ? { metadataPatched: true } : {}),
      ...(annotation.reason ? { reason: annotation.reason } : {}),
      remember: annotation.remember ?? "auto",
      ...(annotation.verified === true ? { verified: true } : {}),
    };
  };

  const getNeverAnnotatedMessageIndexes = (
    input: MemoryExtractionInput,
  ): Set<number> =>
    new Set(
      (input.annotations ?? [])
        .filter((annotation) => annotation.remember === "never")
        .map((annotation) => annotation.messageIndex),
    );

  const maskNeverAnnotatedMessages = (
    input: MemoryExtractionInput,
  ): MemoryExtractionInput => {
    const blockedIndexes = getNeverAnnotatedMessageIndexes(input);
    if (blockedIndexes.size === 0) {
      return input;
    }

    return {
      ...input,
      messages: input.messages.map((message, messageIndex) =>
        blockedIndexes.has(messageIndex)
          ? {
              ...message,
              content: "",
            }
          : message,
      ),
    };
  };

  const isAssistantWriteAllowed = (
    candidate: MemoryCandidate,
    profile: ResolvedRememberProfile,
    input: MemoryExtractionInput,
  ): boolean => {
    if (candidate.sourceRole !== "assistant") {
      return true;
    }

    const annotation = findAnnotation(input, candidate.sourceMessageIndex);
    if (!annotation || annotation.remember !== "always") {
      return false;
    }

    if (profile.assistantOutputs.mode === "host_tagged_only") {
      return true;
    }

    if (profile.assistantOutputs.mode === "confirmed_only") {
      return annotation.confirmed === true;
    }

    if (profile.assistantOutputs.mode === "verified_only") {
      return annotation.verified === true;
    }

    if (profile.assistantOutputs.mode === "confirmed_or_verified_only") {
      return annotation.confirmed === true || annotation.verified === true;
    }

    return false;
  };

  const applyAnnotations = (
    input: MemoryExtractionInput,
    profile: ResolvedRememberProfile,
    extraction: MemoryExtractionResult,
  ): MemoryExtractionResult => {
    const blockedIndexes = getNeverAnnotatedMessageIndexes(input);
    const candidates = extraction.candidates
      .filter((candidate) => !blockedIndexes.has(candidate.sourceMessageIndex))
      .map((candidate) => {
        const annotation = findAnnotation(input, candidate.sourceMessageIndex);
        if (!annotation) {
          return candidate;
        }

        const annotationTrace = buildAnnotationTrace(annotation);
        if (!annotation?.metadataPatch && !annotation?.kindHint && !annotationTrace) {
          return candidate;
        }

        return {
          ...candidate,
          annotation: annotationTrace ?? candidate.annotation,
          kindHint: annotation.kindHint ?? candidate.kindHint,
          metadata: {
            ...candidate.metadata,
            ...annotation.metadataPatch,
          },
        };
      });

    for (const annotation of input.annotations ?? []) {
      if (annotation.remember !== "always") {
        continue;
      }

      if (blockedIndexes.has(annotation.messageIndex)) {
        continue;
      }

      const message = input.messages[annotation.messageIndex];
      if (!message) {
        continue;
      }

      if (
        candidates.some(
          (candidate) => candidate.sourceMessageIndex === annotation.messageIndex,
        )
      ) {
        continue;
      }

      candidates.push({
        id: `annotation-${annotation.messageIndex + 1}`,
        kindHint: annotation.kindHint ?? "fact",
        explicitness: "explicit",
        annotation: buildAnnotationTrace(annotation),
        extractionSources: ["rules-only"],
        profileId: profile.id,
        presetId: profile.presetId,
        content: message.content,
        sourceMessageIndex: annotation.messageIndex,
        sourceRole: message.role,
        metadata: annotation.metadataPatch,
      });
    }

    return {
      ...extraction,
      candidates,
    };
  };

  const shouldAutoUseAssistedExtraction = (input: {
    request: MemoryExtractionInput;
    baselineExtraction: MemoryExtractionResult;
  }): boolean => {
    if (!assistedExtractor) {
      return false;
    }

    const userMessages = input.request.messages.filter(
      (message) => message.role === "user",
    );
    const combinedUserContent = userMessages
      .map((message) => message.content.trim())
      .filter((content) => content.length > 0)
      .join("\n");
    const durableCandidateKinds = new Set(
      input.baselineExtraction.candidates
        .filter((candidate) => candidate.kindHint !== "noise")
        .map((candidate) => candidate.kindHint),
    );
    const durableCandidateCount = input.baselineExtraction.candidates.filter(
      (candidate) => candidate.kindHint !== "noise",
    ).length;
    const hasCorrectionCue =
      /\b(correction|replace|replaced|supersede|superseded|instead of|use .+ as the source of truth|not .+ source of truth)\b|不再|改成|更正|以.+为准/u.test(
        combinedUserContent,
      );
    const hasDurableCue = AUTO_EXTRACTION_DURABLE_CUE_PATTERN.test(
      combinedUserContent,
    );
    const hasUnderspecifiedReferenceState = input.baselineExtraction.candidates.some(
      (candidate) =>
        candidate.kindHint === "reference" &&
        (
          !extractCanonicalReferencePointer(
            candidate.metadata?.referencePointer ?? candidate.content,
          ) ||
          (candidate.metadata?.subject ?? "unknown") === "unknown"
        ),
    );
    const hasUnderspecifiedProjectState = input.baselineExtraction.candidates.some(
      (candidate) =>
        candidate.kindHint === "fact" &&
        (
          candidate.metadata?.factKind === "blocker" ||
          candidate.metadata?.factKind === "open_loop" ||
          candidate.metadata?.factKind === "project_state"
        ) &&
        (candidate.metadata?.subject ?? "unknown") === "unknown",
    );

    return (
      combinedUserContent.length >= AUTO_EXTRACTION_COMPLEXITY_CHAR_THRESHOLD ||
      (input.baselineExtraction.candidates.length === 0 && hasDurableCue) ||
      hasCorrectionCue ||
      hasUnderspecifiedReferenceState ||
      hasUnderspecifiedProjectState ||
      (
        durableCandidateCount >= AUTO_EXTRACTION_COMPLEX_BATCH_THRESHOLD &&
        combinedUserContent.length >= AUTO_EXTRACTION_COMPLEXITY_CHAR_THRESHOLD / 2 &&
        durableCandidateKinds.size >= 3
      )
    );
  };

  const normalizeExtractionResult = (
    request: MemoryExtractionInput,
    result: MemoryExtractionResult,
  ): MemoryExtractionResult => {
    return {
      ...result,
      candidates: result.candidates.map((candidate) =>
        normalizeMemoryCandidate(
          candidate,
          request.messages[candidate.sourceMessageIndex]?.content,
        )
      ),
    };
  };

  const resolveRequestedExtractionStrategy = (
    strategy: MemoryExtractionStrategy | undefined,
  ): MemoryExtractionStrategy => strategy ?? "auto";

  const resolveExtraction = async (input: MemoryExtractionInput) => {
    const profile = resolveRememberProfile({
      config: config.remember,
      scope: input.scope,
    });
    const extractorInput = maskNeverAnnotatedMessages(input);
    const requestedExtractionStrategy = resolveRequestedExtractionStrategy(
      input.extractionStrategy,
    );
    let baselineExtraction = annotateExtractionResult(
      normalizeExtractionResult(input, await extractor.extract(extractorInput)),
      "rules-only",
    );
    const profileRuleExtractor = createRuleMemoryExtractor({
      profileId: profile.id,
      presetId: profile.presetId,
      rules: profile.rules,
    });

    baselineExtraction = mergeExtractionResults(
      baselineExtraction,
      annotateExtractionResult(
        normalizeExtractionResult(
          input,
          await profileRuleExtractor.extract(extractorInput),
        ),
        "rules-only",
      ),
    );

    for (const [index, profileExtractor] of profile.extractors.entries()) {
      const extractorId = `${profile.id}:extractor-${index + 1}`;
      const profileExtraction = annotateExtractionResult(
        normalizeExtractionResult(
          input,
          await profileExtractor.extract(extractorInput),
        ),
        "rules-only",
      );

      baselineExtraction = mergeExtractionResults(
        baselineExtraction,
        {
          ...profileExtraction,
          candidates: profileExtraction.candidates.map((candidate) => ({
            ...candidate,
            extractorIds: [
              ...new Set([...(candidate.extractorIds ?? []), extractorId]),
            ],
            profileId: candidate.profileId ?? profile.id,
            presetId: candidate.presetId ?? profile.presetId,
          })),
        },
      );
    }

    baselineExtraction = dedupeExtractionResult(
      applyAnnotations(input, profile, baselineExtraction),
    );

    const shouldRunAssistedExtraction =
      requestedExtractionStrategy === "llm-assisted" ||
      (requestedExtractionStrategy === "auto" &&
        shouldAutoUseAssistedExtraction({
          request: extractorInput,
          baselineExtraction,
        }));

    if (!shouldRunAssistedExtraction || !assistedExtractor) {
      return {
        extraction: baselineExtraction,
        profile,
        requestedExtractionStrategy,
        resolvedExtractionStrategy: "rules-only" as const,
      };
    }

    let assistedExtraction: MemoryExtractionResult;

    try {
      assistedExtraction = annotateExtractionResult(
        normalizeExtractionResult(
          input,
          await assistedExtractor.extract({
            ...extractorInput,
            extractionStrategy: "llm-assisted",
          }),
        ),
        "llm-assisted",
      );
    } catch {
      return {
        extraction: baselineExtraction,
        profile,
        requestedExtractionStrategy,
        resolvedExtractionStrategy: "rules-only" as const,
      };
    }

    return {
      extraction: dedupeExtractionResult(
        applyAnnotations(
          input,
          profile,
          mergeExtractionResults(baselineExtraction, assistedExtraction),
        ),
      ),
      profile,
      requestedExtractionStrategy,
      resolvedExtractionStrategy: "llm-assisted" as const,
    };
  };

  return {
    classifyCandidate,

    async extract(input: MemoryExtractionInput) {
      const { extraction } = await resolveExtraction(input);
      return extraction;
    },

    async remember(input: MemoryExtractionInput): Promise<RememberResult> {
      const resolvedLanguage = language.resolveFromMessages({
        locale: input.locale,
        messages: input.messages,
      });
      const {
        extraction,
        profile,
        requestedExtractionStrategy,
        resolvedExtractionStrategy,
      } = await resolveExtraction(input);
      const rollbackActions: RollbackAction[] = [];
      const state: RememberWriteState = {
        accepted: 0,
        rejected: 0,
        events: [],
        pendingEmbeddingWrites: [],
        pendingVectorDeletes: [],
      };
      const episodeCandidates: MemoryCandidate[] = [];
      const policyContext: PolicyContext = {
        scope: input.scope,
        phase: "remember",
        locale: resolvedLanguage.locale,
        localeSource: resolvedLanguage.localeSource,
      };
      const setDocumentWithRollback = async <TDocument extends object>(
        collection: string,
        id: string,
        document: TDocument,
      ): Promise<void> => {
        const previous = await config.documentStore.get<object>(collection, id);
        await config.documentStore.set(collection, id, document);
        rollbackActions.push(async () => {
          if (previous) {
            await config.documentStore.set(collection, id, previous);
            return;
          }

          await config.documentStore.delete(collection, id);
        });
      };
      const deleteDocumentWithRollback = async (
        collection: string,
        id: string,
      ): Promise<void> => {
        const previous = await config.documentStore.get<object>(collection, id);
        if (!previous) {
          return;
        }

        await config.documentStore.delete(collection, id);
        rollbackActions.push(async () => {
          await config.documentStore.set(collection, id, previous);
        });
      };

      try {
        for (const candidate of extraction.candidates) {
          if (!isAssistantWriteAllowed(candidate, profile, input)) {
            state.rejected += 1;
            state.events.push({
              candidateId: candidate.id,
              outcome: "rejected",
              memoryType: toRememberEventMemoryType("reject"),
              reason: "assistant_policy_blocked",
              ...buildRememberEventTrace(candidate),
            });
            continue;
          }

          const classified = classifyCandidate(candidate);

          if (
            classified.decision === "reject" ||
            (config.shouldWrite && !config.shouldWrite(classified))
          ) {
            state.rejected += 1;
            state.events.push({
              candidateId: candidate.id,
              outcome: "rejected",
              memoryType: toRememberEventMemoryType(classified.memoryType),
              reason: classified.reason ?? "policy_rejected",
              ...buildRememberEventTrace(classified),
            });
            continue;
          }

          let effectiveCandidate = classified;

          if (config.policy?.redact) {
            const redacted = await config.policy.redact(effectiveCandidate, policyContext);
            const redactedCandidate: MemoryCandidate = {
              ...effectiveCandidate,
              kindHint: redacted.kindHint,
              content: redacted.content,
              extractionSources: effectiveCandidate.extractionSources,
              metadata: redacted.metadata,
              explicitness: redacted.explicitness,
            };
            effectiveCandidate = classifyCandidate(redactedCandidate);

            if (effectiveCandidate.decision === "reject") {
              state.rejected += 1;
              state.events.push({
                candidateId: candidate.id,
                outcome: "rejected",
                memoryType: toRememberEventMemoryType(effectiveCandidate.memoryType),
                reason:
                  effectiveCandidate.reason === "invalid_payload"
                    ? "invalid_after_redaction"
                    : effectiveCandidate.reason ?? "policy_redacted_invalid",
                ...buildRememberEventTrace(effectiveCandidate),
              });
              continue;
            }
          }

          if (
            config.policy?.shouldRemember &&
            !(await config.policy.shouldRemember(effectiveCandidate, policyContext))
          ) {
            state.rejected += 1;
            state.events.push({
              candidateId: candidate.id,
              outcome: "rejected",
              memoryType: toRememberEventMemoryType(effectiveCandidate.memoryType),
              reason: "policy_blocked",
              ...buildRememberEventTrace(effectiveCandidate),
            });
            continue;
          }

          const acceptedBeforeWrite = state.accepted;
          await writeRememberCandidate({
            candidateId: candidate.id,
            candidate: effectiveCandidate,
            context: {
              input,
              resolvedLanguage,
              language,
              policyContext,
              repositories: config.repositories,
              vectorIndex,
              createId,
              now,
              policy: config.policy,
              setDocumentWithRollback,
              deleteDocumentWithRollback,
            },
            state,
          });

          if (state.accepted > acceptedBeforeWrite) {
            episodeCandidates.push(effectiveCandidate);
          }
        }

        const episode = maybeBuildEpisode(
          input,
          episodeCandidates,
          createId(),
          now(),
          language,
          resolvedLanguage.locale,
        );
        if (episode) {
          await setDocumentWithRollback("episodes", episode.id, episode);
          state.pendingEmbeddingWrites.push(buildEpisodeEmbeddingWrite(episode));
          state.accepted += 1;
          state.events.push({
            candidateId: `episode:${episode.id}`,
            outcome: "written",
            memoryType: "episode",
            memoryId: episode.id,
            reason: "conversation_episode",
            sourceMethod: "explicit",
            extractionSources: ["rules-only"],
          });
        }

        state.rejected += extraction.ignoredMessageCount;

        await commitRememberVectors({
          embedding: config.embedding,
          rollbackActions,
          state,
          vectorIndex,
        });

        return {
          accepted: state.accepted,
          rejected: state.rejected,
          events: state.events,
          metadata: {
            locale: resolvedLanguage.locale,
            localeSource: resolvedLanguage.localeSource,
            adapterId: resolvedLanguage.adapterId,
            analysisMode: resolvedLanguage.analysisMode,
            requestedExtractionStrategy,
            resolvedExtractionStrategy,
          },
        };
      } catch (error) {
        const rollbackErrors = await rollbackRememberWrites(rollbackActions);
        if (rollbackErrors.length > 0) {
          throw new AggregateError(
            [error, ...rollbackErrors],
            "Remember failed and rollback encountered errors.",
          );
        }

        throw error;
      }
    },
  };
}
