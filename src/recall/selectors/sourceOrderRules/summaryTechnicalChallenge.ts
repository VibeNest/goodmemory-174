import type { RankedFactCandidate } from "../../scoring";
import {
  hasAssistantAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

function sourceOrderedTechnicalChallengePriority(input: {
  entry: RankedFactCandidate;
  priority: (entry: RankedFactCandidate) => number;
}): number {
  const content = stripEvidencePrefix(input.entry.fact.content);
  let score = input.priority(input.entry);

  if (
    /\b(?:integrityerror|unique\s+constraint|operationalerror|csrf(?:\s+token)?|account\s+lockout|failed\s+login\s+attempts|redis[\s\S]{0,80}rate\s+limit(?:ing)?|rate\s+limit(?:ing)?[\s\S]{0,80}redis)\b/iu.test(
      content,
    )
  ) {
    score += 520;
  }
  if (/\bcsrf\s+token\s+missing\s+or\s+incorrect\b/iu.test(content)) {
    score += 260;
  }
  if (
    /\b(?:basic\s+password\s+hashing|werkzeug\.security|securely\s+hashing\s+passwords)\b/iu.test(
      content,
    )
  ) {
    score += 420;
  }
  if (
    /\b(?:error|failed|incorrect|missing|trouble|try-except|http\s+500|error\s+logs?)\b/iu.test(
      content,
    )
  ) {
    score += 140;
  }
  if (hasAssistantAnswerTag(input.entry)) {
    score += 20;
  }
  if (
    /\b(?:core\s+functionalit(?:y|ies)|data\s+visualization|estimate\s+the\s+time|task\s+list|template(?:notfound)?|no\s+such\s+table|unauthorized\s+access|blueprints?|lightweight|minimal\s+dependencies|session\s+login|rest\s+api|pull\s+request|code\s+review|caching\s+tweaks?|dashboard\s+api\s+response\s+time)\b/iu.test(
      content,
    )
  ) {
    score -= 520;
  }
  if (
    /\b(?:sqlalchemy\s+for\s+database\s+interactions|starting\s+from\s+scratch|flask\s+routes|ui\/ux|refactor(?:ing)?|maintainability|security\s+best\s+practices)\b/iu.test(
      content,
    )
  ) {
    score -= 420;
  }
  if (content.length > 2500) {
    score -= 120;
  }

  return score;
}

export function selectSourceOrderedTechnicalChallengeMilestones(input: {
  candidates: RankedFactCandidate[];
  priority: (entry: RankedFactCandidate) => number;
  recallLimit: number;
}): RankedFactCandidate[] {
  return [...input.candidates]
    .sort((left, right) => {
      const priorityDelta =
        sourceOrderedTechnicalChallengePriority({
          entry: right,
          priority: input.priority,
        }) -
        sourceOrderedTechnicalChallengePriority({
          entry: left,
          priority: input.priority,
        });
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return compareTemporalFactChronology(left, right);
    })
    .slice(0, input.recallLimit)
    .sort(compareTemporalFactChronology);
}
