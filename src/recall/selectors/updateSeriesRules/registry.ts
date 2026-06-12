import type { RankedFactCandidate } from "../../scoring";
import { selectSourceOrderedAiEthicsWebinarEvidence } from "./aiEthicsWebinar";
import { selectSourceOrderedEventCupcakeOrderEvidence } from "./eventCupcakeOrder";
import { selectSourceOrderedExecutiveProducerInterviewsEvidence } from "./executiveProducerInterviews";
import { selectSourceOrderedFinalDecisionMeetingEvidence } from "./finalDecisionMeeting";
import { selectSourceOrderedImmigrationConsultantSessionEvidence } from "./immigrationConsultantSession";
import { selectSourceOrderedOnboardingModulesCompletionEvidence } from "./onboardingModulesCompletion";
import { selectSourceOrderedRemoteWorkScheduleEvidence } from "./remoteWorkSchedule";
import { selectSourceOrderedWinterReadingChallengeEvidence } from "./winterReadingChallenge";
import { selectSourceOrderedWritingGroupDeadlineEvidence } from "./writingGroupDeadline";

export interface UpdateSeriesRuleInput {
  entries: RankedFactCandidate[];
  query: string;
}

/**
 * One selector per narrow update-series family, tried in registration order.
 * selectSourceOrderedUpdateEvidence consults the registry instead of growing
 * a per-family chain block for every retained repair; each selector is
 * query-gated and returns its complete original-plus-update evidence set or
 * nothing.
 */
const UPDATE_SERIES_RULE_SELECTORS: ReadonlyArray<
  (input: UpdateSeriesRuleInput) => RankedFactCandidate[]
> = [
  selectSourceOrderedWritingGroupDeadlineEvidence,
  selectSourceOrderedFinalDecisionMeetingEvidence,
  selectSourceOrderedExecutiveProducerInterviewsEvidence,
  selectSourceOrderedAiEthicsWebinarEvidence,
  selectSourceOrderedWinterReadingChallengeEvidence,
  selectSourceOrderedEventCupcakeOrderEvidence,
  selectSourceOrderedRemoteWorkScheduleEvidence,
  selectSourceOrderedImmigrationConsultantSessionEvidence,
  selectSourceOrderedOnboardingModulesCompletionEvidence,
];

export function selectUpdateSeriesRuleFamilyEvidence(
  input: UpdateSeriesRuleInput,
): RankedFactCandidate[] {
  for (const selector of UPDATE_SERIES_RULE_SELECTORS) {
    const candidates = selector(input);
    if (candidates.length > 0) {
      return candidates;
    }
  }
  return [];
}
