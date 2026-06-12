import type { RankedFactCandidate } from "../scoring";
import { selectSourceOrderedAcademicMentorSummaryCoverage } from "./sourceOrderRules/academicMentorshipSummary";
import { selectSourceOrderedAiHiringComplianceSummaryCoverage } from "./sourceOrderRules/hiringComplianceSummary";
import { selectSourceOrderedAiHiringProcessSummaryCoverage } from "./sourceOrderRules/hiringProcessSummary";
import { selectSourceOrderedEstatePlanningSummaryCoverage } from "./sourceOrderRules/estatePlanningSummary";
import { selectSourceOrderedFictionBookBudgetSummaryCoverage } from "./sourceOrderRules/fictionBookBudgetSummary";
import { selectSourceOrderedRelationshipFinancialManagementSummaryCoverage } from "./sourceOrderRules/relationshipFinancialManagementSummary";
import { selectSourceOrderedResearchWritingCollaborationSummaryCoverage } from "./sourceOrderRules/researchWritingCollaborationSummary";
import { selectSourceOrderedMovieEventSummaryCoverage } from "./sourceOrderRules/movieEvents";
import { selectSourceOrderedPersonalFinancePlanningSummaryCoverage } from "./sourceOrderRules/personalFinancePlanningSummary";
import { selectSourceOrderedPersonalStatementMentorSummaryCoverage } from "./sourceOrderRules/personalStatementMentorSummary";
import { selectSourceOrderedPilotEpisodeTimelineSummaryCoverage } from "./sourceOrderRules/pilotEpisodeTimelineSummary";
import { selectSourceOrderedProfessionalDevelopmentProjectSummaryCoverage } from "./sourceOrderRules/professionalDevelopmentProjectSummary";
import { selectSourceOrderedProbabilityConceptSummaryCoverage } from "./sourceOrderRules/probabilityConceptSummary";
import { selectSourceOrderedProfessionalPreparationSummaryCoverage } from "./sourceOrderRules/professionalPreparationSummary";
import { selectSourceOrderedReadingGoalsStrategySummaryCoverage } from "./sourceOrderRules/readingGoalsStrategySummary";
import { selectSourceOrderedRelationshipWorkSummaryCoverage } from "./sourceOrderRules/relationshipWorkSummary";
import { selectSourceOrderedResumeStrategySummaryCoverage } from "./sourceOrderRules/resumeStrategySummary";
import { selectSourceOrderedSneakerSummaryCoverage } from "./sourceOrderRules/footwearPreferenceSummary";
import { selectSourceOrderedStudyAbroadSummaryCoverage } from "./sourceOrderRules/studyAbroadSummary";
import { selectSourceOrderedTimeStressCollaborationSummaryCoverage } from "./sourceOrderRules/timeStressCollaborationSummary";
import { selectSourceOrderedTriangleGeometrySummaryCoverage } from "./sourceOrderRules/triangleGeometrySummary";
import { selectSourceOrderedWritingSkillsConfidenceSummaryCoverage } from "./sourceOrderRules/writingSkillsConfidenceSummary";

interface SourceOrderedSpecializedSummaryInput {
  allSourceCandidates?: RankedFactCandidate[];
  companionDistance: number;
  limit: number;
  minAnchors: number;
  query: string;
  sourceCandidates: RankedFactCandidate[];
}

interface SpecializedSummaryRule {
  id: string;
  select: (
    input: SourceOrderedSpecializedSummaryInput,
  ) => RankedFactCandidate[];
}

function withAllSourceCandidates(
  input: SourceOrderedSpecializedSummaryInput,
): SourceOrderedSpecializedSummaryInput {
  return {
    ...input,
    sourceCandidates: input.allSourceCandidates ?? input.sourceCandidates,
  };
}

const SPECIALIZED_SUMMARY_RULES: readonly SpecializedSummaryRule[] = [
  {
    id: "relationship-work",
    select: selectSourceOrderedRelationshipWorkSummaryCoverage,
  },
  {
    id: "time-stress-collaboration",
    select: selectSourceOrderedTimeStressCollaborationSummaryCoverage,
  },
  {
    id: "pilot-episode-timeline",
    select: (input) =>
      selectSourceOrderedPilotEpisodeTimelineSummaryCoverage({
        query: input.query,
        sourceCandidates: input.allSourceCandidates ?? input.sourceCandidates,
      }),
  },
  {
    id: "writing-skills-confidence",
    select: (input) =>
      selectSourceOrderedWritingSkillsConfidenceSummaryCoverage({
        query: input.query,
        sourceCandidates: input.allSourceCandidates ?? input.sourceCandidates,
      }),
  },
  {
    id: "professional-preparation",
    select: selectSourceOrderedProfessionalPreparationSummaryCoverage,
  },
  {
    id: "professional-development-project",
    select: selectSourceOrderedProfessionalDevelopmentProjectSummaryCoverage,
  },
  {
    id: "academic-mentor",
    select: (input) =>
      selectSourceOrderedAcademicMentorSummaryCoverage(
        withAllSourceCandidates(input),
      ),
  },
  {
    id: "fiction-book-budget",
    select: (input) =>
      selectSourceOrderedFictionBookBudgetSummaryCoverage(
        withAllSourceCandidates(input),
      ),
  },
  {
    id: "relationship-financial-management",
    select: (input) =>
      selectSourceOrderedRelationshipFinancialManagementSummaryCoverage({
        query: input.query,
        sourceCandidates: input.allSourceCandidates ?? input.sourceCandidates,
      }),
  },
  {
    id: "personal-finance-planning",
    select: (input) =>
      selectSourceOrderedPersonalFinancePlanningSummaryCoverage({
        query: input.query,
        sourceCandidates: input.allSourceCandidates ?? input.sourceCandidates,
      }),
  },
  {
    id: "reading-goals-strategy",
    select: (input) =>
      selectSourceOrderedReadingGoalsStrategySummaryCoverage(
        withAllSourceCandidates(input),
      ),
  },
  {
    id: "research-writing-collaboration",
    select: (input) =>
      selectSourceOrderedResearchWritingCollaborationSummaryCoverage(
        withAllSourceCandidates(input),
      ),
  },
  {
    id: "ai-hiring-compliance",
    select: selectSourceOrderedAiHiringComplianceSummaryCoverage,
  },
  {
    id: "ai-hiring-process",
    select: selectSourceOrderedAiHiringProcessSummaryCoverage,
  },
  {
    id: "resume-strategy",
    select: selectSourceOrderedResumeStrategySummaryCoverage,
  },
  {
    id: "personal-statement-mentor",
    select: selectSourceOrderedPersonalStatementMentorSummaryCoverage,
  },
  {
    id: "probability-concept",
    select: (input) =>
      selectSourceOrderedProbabilityConceptSummaryCoverage(
        withAllSourceCandidates(input),
      ),
  },
  {
    id: "estate-planning",
    select: selectSourceOrderedEstatePlanningSummaryCoverage,
  },
  {
    id: "study-abroad",
    select: selectSourceOrderedStudyAbroadSummaryCoverage,
  },
  {
    id: "triangle-geometry",
    select: (input) =>
      selectSourceOrderedTriangleGeometrySummaryCoverage(
        withAllSourceCandidates(input),
      ),
  },
  {
    id: "footwear-preference",
    select: selectSourceOrderedSneakerSummaryCoverage,
  },
  {
    id: "movie-events",
    select: selectSourceOrderedMovieEventSummaryCoverage,
  },
];

export function selectSourceOrderedSpecializedSummaryCoverage(
  input: SourceOrderedSpecializedSummaryInput,
): RankedFactCandidate[] {
  for (const rule of SPECIALIZED_SUMMARY_RULES) {
    const selection = rule.select(input);
    if (selection.length > 0) {
      return selection;
    }
  }

  return [];
}
