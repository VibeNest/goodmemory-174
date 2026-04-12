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
  mergeExtractionResults,
} from "./extraction";
import { writeRememberCandidate } from "./handlers";
import {
  classifyCandidate,
  buildRememberEventTrace,
  toRememberEventMemoryType,
} from "./classification";
import type {
  MemoryCandidate,
  MemoryExtractionInput,
  MemoryExtractionResult,
} from "./candidates";
import type {
  RememberEngineConfig,
  RememberResult,
  RollbackAction,
  RememberWriteState,
} from "./contracts";
import { commitRememberVectors, rollbackRememberWrites } from "./vectorOps";

export type {
  ClassifiedCandidate,
  RememberEngineConfig,
  RememberEvent,
  RememberResult,
} from "./contracts";

export function createRememberEngine(config: RememberEngineConfig) {
  const language = config.language ?? createLanguageService();
  const extractor =
    config.extractor ??
    createDeterministicMemoryExtractor({
      service: language,
    });
  const assistedExtractor = config.assistedExtractor;
  const now = config.now ?? (() => new Date().toISOString());
  const createId = config.createId ?? (() => crypto.randomUUID());

  const resolveExtraction = async (input: MemoryExtractionInput) => {
    const requestedExtractionStrategy =
      input.extractionStrategy ?? "rules-only";
    const baselineExtraction = annotateExtractionResult(
      await extractor.extract(input),
      "rules-only",
    );

    if (requestedExtractionStrategy !== "llm-assisted" || !assistedExtractor) {
      return {
        extraction: baselineExtraction,
        requestedExtractionStrategy,
        resolvedExtractionStrategy: "rules-only" as const,
      };
    }

    let assistedExtraction: MemoryExtractionResult;

    try {
      assistedExtraction = annotateExtractionResult(
        await assistedExtractor.extract(input),
        "llm-assisted",
      );
    } catch {
      return {
        extraction: baselineExtraction,
        requestedExtractionStrategy,
        resolvedExtractionStrategy: "rules-only" as const,
      };
    }

    return {
      extraction: mergeExtractionResults(baselineExtraction, assistedExtraction),
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
      const episodeRedactions: Array<{ from: string; to: string }> = [];
      const policyContext: PolicyContext = {
        scope: input.scope,
        phase: "remember",
        locale: resolvedLanguage.locale,
        localeSource: resolvedLanguage.localeSource,
      };
      const vectorIndex = config.repositories.vectorIndex;
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

            const originalContent = candidate.content.trim();
            const redactedContent = effectiveCandidate.content.trim();
            if (originalContent.length > 0 && originalContent !== redactedContent) {
              episodeRedactions.push({
                from: originalContent,
                to: redactedContent,
              });
            }
          }
        }

        const episode = maybeBuildEpisode(
          input,
          episodeCandidates,
          createId(),
          now(),
          language,
          resolvedLanguage.locale,
          episodeRedactions,
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
