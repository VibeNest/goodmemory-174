import type {
  EpisodeMemory,
  FactMemory,
  ReferenceMemory,
} from "../domain/records";
import {
  createLanguageService,
  type LanguageService,
} from "../language";

export interface VerificationHint {
  memoryId: string;
  memoryType: "fact" | "reference" | "episode";
  reason: string;
}

export interface VerificationPolicyInput {
  query: string;
  referenceTime: string;
  facts: FactMemory[];
  references?: ReferenceMemory[];
  episodes?: EpisodeMemory[];
  locale?: string;
  language?: LanguageService;
}

const DEFAULT_LANGUAGE = createLanguageService();

function daysBetween(left: string, right: string): number {
  const ms = Math.abs(new Date(left).getTime() - new Date(right).getTime());
  return ms / (1000 * 60 * 60 * 24);
}

export function evaluateVerificationHints(
  input: VerificationPolicyInput,
): VerificationHint[] {
  const hints: VerificationHint[] = [];
  const language = input.language ?? DEFAULT_LANGUAGE;
  const locale =
    input.locale ??
    language.resolveFromText({
      text: input.query,
    }).locale;
  const actionDriving = language.isActionDrivingQuery(input.query, locale);

  for (const fact of input.facts) {
    const factAgeDays = daysBetween(input.referenceTime, fact.updatedAt);
    const stale = factAgeDays >= 30;
    const inferred = fact.source.method === "inferred";

    if (!actionDriving && !stale) {
      continue;
    }

    if (stale) {
      hints.push({
        memoryId: fact.id,
        memoryType: "fact",
        reason: `stale fact (${Math.floor(factAgeDays)} days old) should be verified before action`,
      });
      continue;
    }

    if (actionDriving && inferred) {
      hints.push({
        memoryId: fact.id,
        memoryType: "fact",
        reason: "inferred fact should be verified before driving action",
      });
    }
  }

  if (actionDriving) {
    for (const reference of input.references ?? []) {
      const referenceAgeDays = daysBetween(input.referenceTime, reference.updatedAt);
      if (referenceAgeDays < 30) {
        continue;
      }

      hints.push({
        memoryId: reference.id,
        memoryType: "reference",
        reason: `stale reference (${Math.floor(referenceAgeDays)} days old) should be re-checked before action`,
      });
    }

    for (const episode of input.episodes ?? []) {
      const episodeAgeDays = daysBetween(input.referenceTime, episode.createdAt);
      if (episodeAgeDays < 30) {
        continue;
      }

      hints.push({
        memoryId: episode.id,
        memoryType: "episode",
        reason: `stale episode (${Math.floor(episodeAgeDays)} days old) should be re-validated before action`,
      });
    }
  }

  return hints;
}
