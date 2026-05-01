import { createFeedbackMemory, type FeedbackMemory } from "../domain/records";
import { createMemorySource } from "../domain/provenance";
import type { MemoryScope } from "../domain/scope";
import type { LanguageService } from "../language";
import type { EvolutionRepositoryPort } from "../storage/ports";
import { readCompiledGuidance } from "./behavioralTelemetry";
import { attachBehavioralPolicyAttributes } from "./behavioralPolicy";

function feedbackLocale(feedback: Pick<FeedbackMemory, "source">): string | undefined {
  return feedback.source.locale;
}

function feedbackMatchesScope(
  feedback: FeedbackMemory,
  proposal: {
    userId: string;
    tenantId?: string;
    workspaceId?: string;
    agentId?: string;
    sessionId?: string;
  },
): boolean {
  return (
    feedback.userId === proposal.userId &&
    feedback.tenantId === proposal.tenantId &&
    feedback.workspaceId === proposal.workspaceId &&
    feedback.agentId === proposal.agentId
  );
}

function normalizeRule(
  feedback: Pick<FeedbackMemory, "rule" | "source">,
  language: LanguageService,
): string {
  const locale =
    feedbackLocale(feedback) ??
    language.resolveFromText({
      text: feedback.rule,
    }).locale;

  return language.normalizeForEquality(feedback.rule, locale);
}

export interface ProceduralPatternCompilerConfig {
  createId?: () => string;
  language: LanguageService;
  now?: () => string;
  repositories: EvolutionRepositoryPort;
}

export interface ProceduralPatternCompilerResult {
  compiledCount: number;
}

export function createProceduralPatternCompiler(
  config: ProceduralPatternCompilerConfig,
) {
  const createId = config.createId ?? (() => crypto.randomUUID());
  const now = config.now ?? (() => new Date().toISOString());

  return {
    async compile(scope: MemoryScope): Promise<ProceduralPatternCompilerResult> {
      const [feedback, proposals, promotions] = await Promise.all([
        config.repositories.feedback.listByScope(scope),
        config.repositories.proposals.listByScope(scope),
        config.repositories.promotions.listByScope(scope),
      ]);
      const feedbackById = new Map(feedback.map((record) => [record.id, record] as const));
      const acceptedProposalIds = new Set(
        promotions
          .filter((promotion) => promotion.decision === "accepted")
          .map((promotion) => promotion.proposalId),
      );
      const acceptedProceduralProposals = proposals.filter(
        (proposal) =>
          proposal.proposalType === "procedural_pattern" &&
          proposal.status === "accepted" &&
          acceptedProposalIds.has(proposal.id),
      );
      let compiledCount = 0;

      for (const proposal of acceptedProceduralProposals) {
        const sourceFeedbackId = proposal.linkedMemoryIds[0];
        const sourceFeedback = sourceFeedbackId
          ? feedbackById.get(sourceFeedbackId)
          : undefined;
        const compiledGuidance = readCompiledGuidance(proposal);
        const feedbackSeed =
          sourceFeedback &&
          sourceFeedback.kind !== "validated_pattern" &&
          sourceFeedback.lifecycle === "active"
            ? sourceFeedback
            : compiledGuidance
              ? {
                  rule: compiledGuidance.rule,
                  source: createMemorySource({
                    method: "confirmed",
                    extractedAt: now(),
                    sessionId: proposal.sessionId,
                  }),
                }
              : undefined;

        if (!feedbackSeed) {
          continue;
        }

        const normalizedRule = normalizeRule(feedbackSeed, config.language);
        const existingValidatedPattern = feedback.find(
          (record) =>
            record.lifecycle === "active" &&
            record.kind === "validated_pattern" &&
            record.appliesTo === (sourceFeedback?.appliesTo ?? compiledGuidance?.appliesTo) &&
            feedbackMatchesScope(record, proposal) &&
            normalizeRule(record, config.language) === normalizedRule,
        );

        if (existingValidatedPattern) {
          if (sourceFeedback?.lifecycle === "active") {
            const supersededSource = createFeedbackMemory({
              ...sourceFeedback,
              lifecycle: "superseded",
              supersededBy: existingValidatedPattern.id,
              updatedAt: now(),
            });
            await config.repositories.feedback.upsert(supersededSource);
            feedbackById.set(supersededSource.id, supersededSource);
          }
          continue;
        }

        const timestamp = now();
        const compiledPattern = createFeedbackMemory({
          id: createId(),
          userId: proposal.userId,
          tenantId: proposal.tenantId,
          workspaceId: proposal.workspaceId,
          agentId: proposal.agentId,
          rule: feedbackSeed.rule,
          kind: "validated_pattern",
          appliesTo: sourceFeedback?.appliesTo ?? compiledGuidance?.appliesTo,
          why: compiledGuidance?.why ?? proposal.rationale,
          evidence: proposal.linkedEvidenceIds,
          confidence: sourceFeedback?.confidence ?? compiledGuidance?.confidence,
          attributes: compiledGuidance?.behavioralPolicy
            ? attachBehavioralPolicyAttributes(
                sourceFeedback?.attributes,
                compiledGuidance.behavioralPolicy,
              )
            : sourceFeedback?.attributes,
          source: createMemorySource({
            method: "confirmed",
            extractedAt: timestamp,
            sessionId: proposal.sessionId,
            locale: feedbackLocale(feedbackSeed),
          }),
          lastUsedAt: sourceFeedback?.lastUsedAt,
          updatedAt: timestamp,
        });
        if (sourceFeedback) {
          const supersededSource = createFeedbackMemory({
            ...sourceFeedback,
            lifecycle: "superseded",
            supersededBy: compiledPattern.id,
            updatedAt: timestamp,
          });

          await config.repositories.feedback.upsert(supersededSource);
          feedback.push(supersededSource);
          feedbackById.set(supersededSource.id, supersededSource);
        }
        await config.repositories.feedback.upsert(compiledPattern);
        feedback.push(compiledPattern);
        feedbackById.set(compiledPattern.id, compiledPattern);
        compiledCount += 1;
      }

      return {
        compiledCount,
      };
    },
  };
}
