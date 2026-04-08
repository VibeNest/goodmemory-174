import {
  createFactMemory,
  createEpisodeMemory,
} from "../domain/records";
import type {
  EpisodeMemory,
  FactMemory,
} from "../domain/records";
import type { MemoryScope } from "../domain/scope";
import type { MemoryRepositories } from "../storage/repositories";
import {
  createLanguageService,
  type LanguageService,
} from "../language";

export type MaintenanceJobName = "dedupe" | "contradiction" | "consolidation";

export interface MaintenanceRunnerConfig {
  repositories: MemoryRepositories;
  now?: () => string;
  language?: LanguageService;
}

export interface MaintenanceJobReport {
  name: MaintenanceJobName;
  applied: number;
}

export interface MaintenanceRunReport {
  scope: MemoryScope;
  ranAt: string;
  jobs: MaintenanceJobReport[];
}

function sortFactsForMaintenance(facts: FactMemory[]): FactMemory[] {
  return [...facts].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

function sortEpisodesForMaintenance(episodes: EpisodeMemory[]): EpisodeMemory[] {
  return [...episodes].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

async function runDedupeCleanup(
  repositories: MemoryRepositories,
  language: LanguageService,
  scope: MemoryScope,
  timestamp: string,
): Promise<MaintenanceJobReport> {
  const facts = sortFactsForMaintenance(
    (await repositories.facts.listByScope(scope)).filter((fact) => fact.lifecycle === "active"),
  );
  const seen = new Map<string, FactMemory>();
  let applied = 0;

  for (const fact of facts) {
    const locale = language.resolveFromText({
      text: fact.content,
    }).locale;
    const key = language.normalizeForEquality(fact.content, locale);
    const winner = seen.get(key);

    if (!winner) {
      seen.set(key, fact);
      continue;
    }

    await repositories.facts.add(
      createFactMemory({
        ...fact,
        lifecycle: "superseded",
        isActive: false,
        supersededBy: winner.id,
        updatedAt: timestamp,
      }),
    );
    applied += 1;
  }

  return {
    name: "dedupe",
    applied,
  };
}

async function runContradictionRepair(
  repositories: MemoryRepositories,
  language: LanguageService,
  scope: MemoryScope,
  timestamp: string,
): Promise<MaintenanceJobReport> {
  const facts = sortFactsForMaintenance(
    (await repositories.facts.listByScope(scope)).filter((fact) => fact.lifecycle === "active"),
  );
  let applied = 0;

  for (let i = 0; i < facts.length; i += 1) {
    const left = facts[i]!;
    if (left.lifecycle !== "active") {
      continue;
    }

    for (let j = i + 1; j < facts.length; j += 1) {
      const right = facts[j]!;
      if (right.lifecycle !== "active") {
        continue;
      }

      const leftLocale = language.resolveFromText({
        text: left.content,
      }).locale;
      const rightLocale = language.resolveFromText({
        text: right.content,
      }).locale;
      if (!language.localesCompatible(leftLocale, rightLocale)) {
        continue;
      }

      const overlap = language.tokenOverlap(left.content, right.content, leftLocale, {
        excludeStopwords: true,
      });
      if (overlap < 0.3) {
        continue;
      }

      const leftPolarity = language.detectFactPolarity(left.content, leftLocale);
      const rightPolarity = language.detectFactPolarity(right.content, rightLocale);

      if (
        leftPolarity === "unknown" ||
        rightPolarity === "unknown" ||
        leftPolarity === rightPolarity
      ) {
        continue;
      }

      const leftStrength =
        (left.source.method === "explicit" ? 2 : 0) + left.confidence;
      const rightStrength =
        (right.source.method === "explicit" ? 2 : 0) + right.confidence;
      const weaker = leftStrength <= rightStrength ? left : right;

      await repositories.facts.add(
        createFactMemory({
          ...weaker,
          lifecycle: "inactive",
          isActive: false,
          updatedAt: timestamp,
        }),
      );
      applied += 1;
      break;
    }
  }

  return {
    name: "contradiction",
    applied,
  };
}

async function runEpisodeConsolidation(
  repositories: MemoryRepositories,
  language: LanguageService,
  scope: MemoryScope,
  timestamp: string,
): Promise<MaintenanceJobReport> {
  const episodes = sortEpisodesForMaintenance(
    (await repositories.episodes.listByScope(scope)).filter((episode) => !episode.archivedAt),
  );

  for (let i = 0; i < episodes.length; i += 1) {
    const left = episodes[i]!;

    for (let j = i + 1; j < episodes.length; j += 1) {
      const right = episodes[j]!;
      const leftLocale = language.resolveFromText({
        text: left.topics.join(" "),
      }).locale;
      const rightLocale = language.resolveFromText({
        text: right.topics.join(" "),
      }).locale;
      if (!language.localesCompatible(leftLocale, rightLocale)) {
        continue;
      }

      const topicScore = language.tokenOverlap(
        left.topics.join(" "),
        right.topics.join(" "),
        leftLocale,
        {
          excludeStopwords: true,
        },
      );

      if (topicScore < 0.3) {
        continue;
      }

      const consolidated = createEpisodeMemory({
        id: crypto.randomUUID(),
        userId: scope.userId,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        agentId: scope.agentId,
        sessionId: scope.sessionId,
        summary: `Consolidated: ${left.summary} | ${right.summary}`,
        keyDecisions: [...new Set([...left.keyDecisions, ...right.keyDecisions])],
        unresolvedItems: [...new Set([...left.unresolvedItems, ...right.unresolvedItems])],
        topics: [...new Set([...left.topics, ...right.topics])],
        importance: Math.max(left.importance, right.importance),
        confidence: Math.max(left.confidence, right.confidence),
        createdAt: timestamp,
      });

      await repositories.episodes.add(
        createEpisodeMemory({
          ...left,
          archivedAt: timestamp,
        }),
      );
      await repositories.episodes.add(
        createEpisodeMemory({
          ...right,
          archivedAt: timestamp,
        }),
      );
      await repositories.episodes.add(consolidated);

      return {
        name: "consolidation",
        applied: 1,
      };
    }
  }

  return {
    name: "consolidation",
    applied: 0,
  };
}

export function createMaintenanceRunner(config: MaintenanceRunnerConfig) {
  const language = config.language ?? createLanguageService();
  const now = config.now ?? (() => new Date().toISOString());

  return {
    async run(
      scope: MemoryScope,
      jobs: MaintenanceJobName[] = ["dedupe", "contradiction", "consolidation"],
    ): Promise<MaintenanceRunReport> {
      const timestamp = now();
      const reports: MaintenanceJobReport[] = [];

      for (const job of jobs) {
        if (job === "dedupe") {
          reports.push(
            await runDedupeCleanup(config.repositories, language, scope, timestamp),
          );
          continue;
        }

        if (job === "consolidation") {
          reports.push(
            await runEpisodeConsolidation(
              config.repositories,
              language,
              scope,
              timestamp,
            ),
          );
          continue;
        }

        reports.push(
          await runContradictionRepair(
            config.repositories,
            language,
            scope,
            timestamp,
          ),
        );
      }

      return {
        scope,
        ranAt: timestamp,
        jobs: reports,
      };
    },
  };
}
