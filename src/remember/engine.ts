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
  MemoryCandidateMetadata,
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
  const SOURCE_MESSAGE_TAG = "source_message";
  const SOURCE_ORDER_TAG = "source_order";
  const USER_ANSWER_TAG = "user_answer";
  const ASSISTANT_ANSWER_TAG = "assistant_answer";
  const DATED_EVENT_TAG = "dated_event";
  const SOURCE_TEMPORAL_MARKER_PATTERN =
    /\b(?:\d{4}[/-]\d{1,2}[/-]\d{1,2}|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[-/ ]\d{1,2}[-/ ]\d{2,4}|time\s*=\s*(?!unknown\b)[^\]\s]+)\b/iu;
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

  const appendTag = (tags: string[], tag: string): void => {
    if (!tags.includes(tag)) {
      tags.push(tag);
    }
  };

  const shouldPreserveAnnotatedSourceMessage = (
    annotation: MessageAnnotation,
  ): boolean =>
    annotation.remember === "always" &&
    annotation.metadataPatch !== undefined &&
    (annotation.confirmed === true || annotation.verified === true);

  const resolveOriginalRole = (
    annotation: MessageAnnotation,
    message: { role: string },
  ): string => {
    const attributeRole =
      annotation.metadataPatch?.attributes?.originalRole ??
      annotation.metadataPatch?.attributes?.sourceRole;

    return String(attributeRole ?? message.role).trim().toLowerCase();
  };

  const sourceOrderAttribute = (
    metadataPatch: MemoryCandidateMetadata,
  ) =>
    metadataPatch.attributes?.sourceOrder ??
    metadataPatch.attributes?.chatId ??
    metadataPatch.attributes?.chat_id ??
    metadataPatch.attributes?.sourceMessageIndex;

  const hasSourceOrderCue = (
    metadataPatch: MemoryCandidateMetadata,
  ): boolean =>
    sourceOrderAttribute(metadataPatch) !== undefined ||
    (metadataPatch.tags ?? []).some((tag) =>
      tag === SOURCE_MESSAGE_TAG ||
      tag === SOURCE_ORDER_TAG ||
      /^chat_id:\d+$/u.test(tag)
    );

  const buildPreservedSourceMetadata = (
    annotation: MessageAnnotation,
    message: { content: string; role: string },
  ): MemoryCandidateMetadata => {
    const metadataPatch = annotation.metadataPatch ?? {};
    const tags = [...(metadataPatch.tags ?? [])];
    const orderAttribute = sourceOrderAttribute(metadataPatch);
    const shouldTrackSourceOrder = hasSourceOrderCue(metadataPatch);
    const attributes = shouldTrackSourceOrder
      ? {
          ...(metadataPatch.attributes ?? {}),
          sourceMessageIndex: annotation.messageIndex,
          sourceOrder: orderAttribute ?? annotation.messageIndex,
        }
      : metadataPatch.attributes;
    const originalRole = resolveOriginalRole(annotation, message);

    appendTag(tags, SOURCE_MESSAGE_TAG);
    if (shouldTrackSourceOrder) {
      appendTag(tags, SOURCE_ORDER_TAG);
    }
    if (originalRole === "user") {
      appendTag(tags, USER_ANSWER_TAG);
    } else if (originalRole === "assistant") {
      appendTag(tags, ASSISTANT_ANSWER_TAG);
    }
    if (SOURCE_TEMPORAL_MARKER_PATTERN.test(message.content)) {
      appendTag(tags, DATED_EVENT_TAG);
    }

    return {
      ...metadataPatch,
      attributes,
      tags,
    };
  };

  const mergeCandidateMetadata = (
    base: MemoryCandidateMetadata | undefined,
    patch: MemoryCandidateMetadata | undefined,
  ): MemoryCandidateMetadata | undefined => {
    if (!base) {
      return patch;
    }
    if (!patch) {
      return base;
    }

    return {
      ...base,
      ...patch,
      attributes: {
        ...(base.attributes ?? {}),
        ...(patch.attributes ?? {}),
      },
      tags: [
        ...new Set([
          ...(base.tags ?? []),
          ...(patch.tags ?? []),
        ]),
      ],
    };
  };

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
        const explicitness =
          annotation.remember === "always" &&
          (annotation.confirmed === true || annotation.verified === true)
            ? "explicit"
            : candidate.explicitness;
        const preserveSource = shouldPreserveAnnotatedSourceMessage(annotation);
        const annotationMetadata = preserveSource
          ? buildPreservedSourceMetadata(annotation, input.messages[candidate.sourceMessageIndex] ?? {
              content: candidate.content,
              role: candidate.sourceRole,
            })
          : annotation.metadataPatch;

        return {
          ...candidate,
          annotation: annotationTrace ?? candidate.annotation,
          explicitness,
          kindHint: annotation.kindHint ?? candidate.kindHint,
          metadata: mergeCandidateMetadata(candidate.metadata, annotationMetadata),
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

      const hasCandidateForMessage = candidates.some(
        (candidate) => candidate.sourceMessageIndex === annotation.messageIndex,
      );
      const hasExactSourceCandidate = candidates.some(
        (candidate) =>
          candidate.sourceMessageIndex === annotation.messageIndex &&
          candidate.content.trim() === message.content.trim(),
      );
      const preserveSource = shouldPreserveAnnotatedSourceMessage(annotation);

      if (
        hasCandidateForMessage &&
        (
          !preserveSource ||
          hasExactSourceCandidate
        )
      ) {
        continue;
      }

      candidates.push({
        id: preserveSource
          ? `annotation-source-${annotation.messageIndex + 1}`
          : `annotation-${annotation.messageIndex + 1}`,
        kindHint: annotation.kindHint ?? "fact",
        explicitness: "explicit",
        annotation: buildAnnotationTrace(annotation),
        extractionSources: ["rules-only"],
        profileId: profile.id,
        presetId: profile.presetId,
        content: message.content,
        sourceMessageIndex: annotation.messageIndex,
        sourceRole: message.role,
        metadata: preserveSource
          ? buildPreservedSourceMetadata(annotation, message)
          : annotation.metadataPatch,
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

  const applyProfileTrace = (
    result: MemoryExtractionResult,
    profile: ResolvedRememberProfile,
  ): MemoryExtractionResult => ({
    ...result,
    candidates: result.candidates.map((candidate) => ({
      ...candidate,
      profileId: profile.id,
      presetId: profile.presetId,
    })),
  });

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
      applyProfileTrace(
        normalizeExtractionResult(input, await extractor.extract(extractorInput)),
        profile,
      ),
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
        applyProfileTrace(
          normalizeExtractionResult(
            input,
            await profileRuleExtractor.extract(extractorInput),
          ),
          profile,
        ),
        "rules-only",
      ),
    );

    for (const profileExtractor of profile.extractors) {
      const profileExtraction = annotateExtractionResult(
        applyProfileTrace(
          normalizeExtractionResult(
            input,
            await profileExtractor.extractor.extract(extractorInput),
          ),
          profile,
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
              ...new Set([
                ...(candidate.extractorIds ?? []),
                profileExtractor.id,
              ]),
            ],
            profileId: profile.id,
            presetId: profile.presetId,
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
        applyProfileTrace(
          normalizeExtractionResult(
            input,
            await assistedExtractor.extract({
              ...extractorInput,
              extractionStrategy: "llm-assisted",
            }),
          ),
          profile,
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
