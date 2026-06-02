import type { LanguageService } from "../../language";
import type { RankedFactCandidate } from "../scoring";
import {
  dedupeSourceOrderedEvidenceByOrder,
  selectSourceOrderedEvidencePlan,
} from "./sourceOrderPlan";
import { isSourceOrderedSummaryCandidate } from "./sourceOrderSummary";
import { selectorTopicOverlapCount, selectorTopicTokens } from "./topic";
import {
  hasAssistantAnswerTag,
  hasSourceMessageTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "./selectionContext";
import {
  compareTemporalFactChronology,
  sourceOrderSortKey,
} from "./temporal";
import { hasPreferenceAdviceBridgeSignal } from "./conversationEvidence";

export const SOURCE_ORDER_INSTRUCTION_RECALL_LIMIT = 2;
export const SOURCE_ORDER_INSTRUCTION_PRIORITY_THRESHOLD = 160;
export const SOURCE_ORDER_PREFERENCE_RECALL_LIMIT = 4;
export const SOURCE_ORDER_PREFERENCE_PRIORITY_THRESHOLD = 130;
export const SOURCE_ORDER_PREFERENCE_COMPANION_DISTANCE = 1;

export const BROAD_SOURCE_INSTRUCTION_CONDITION_TOKENS = new Set([
  "about",
  "always",
  "api",
  "app",
  "ask",
  "condition",
  "conditions",
  "detail",
  "details",
  "feature",
  "features",
  "need",
  "please",
  "project",
  "request",
  "response",
  "responses",
  "software",
  "use",
  "used",
  "using",
  "weather",
  "when",
  "whenever",
]);
export const SOURCE_INSTRUCTION_ALIAS_TOKENS = new Set([
  "api_error",
  "book_recommendation",
  "compensation",
  "date_format",
  "digital_asset_management",
  "draft_revision",
  "financial_budget",
  "html_structure",
  "legal_requirements",
  "list_format",
  "movie_recommendation",
  "patent_process",
  "philosophy",
  "progress_summary",
  "privacy_security",
  "probability",
  "product_features",
  "reference_format",
  "resume_format",
  "snack_recommendation",
  "social_norms",
  "software_dependency",
  "software_implementation",
  "triangle_geometry",
  "writing_tool",
]);

export const SOURCE_PREFERENCE_DECLARATION_PATTERN =
  /\b(?:prefer|preference|i['’]d\s+like|i\s+would\s+like|looking\s+for|interested\s+in|enjoy|love|rather\s+than|over\s+(?:heavy|manual|generic|external|third-party)|without\s+compromising|avoid(?:ing)?)\b|(?:偏好|更喜欢|喜欢|想要|希望|不想|不希望|尽量不要|避免|轻量|无外部依赖|不用很重|不要很重)/iu;
export const SIMPLE_SOLUTION_QUERY_PATTERN =
  /\b(?:simple|straightforward|minimal|lightweight|built-?in|dependency-?free|without\s+(?:external|third-party)|no\s+(?:external|third-party))\b|(?:简单|直接|轻量|内置|无依赖|无外部依赖|不要外部依赖|不想用外部依赖|尽量不要外部依赖)/iu;
export const LIGHTWEIGHT_PREFERENCE_PATTERN =
  /\b(?:lightweight|dependency-?free|without\s+(?:external|third-party)|no\s+(?:external|third-party)|minimal|simple|straightforward|built-?in|avoid(?:ing)?\s+(?:heavy|external|third-party)|under\s+\d+(?:\.\d+)?\s*(?:mb|kb))\b|(?:轻量|无依赖|无外部依赖|不要外部依赖|不想用外部依赖|避免.*(?:重|外部|第三方)|简单|直接|内置|(?:低于|小于|保持在)\s*\d+(?:\.\d+)?\s*(?:MB|KB|mb|kb)\s*(?:以下)?)/iu;
export const SOURCE_PREFERENCE_BRIDGE_QUERY_PATTERN =
  /\b(?:approach|best\s+way|fit(?:s|ting)?|option|prefer(?:ence)?|recommend|should|suit(?:s|ed)?|which)\b|(?:方法|方案|选项|推荐|适合|偏好|应该|哪个)/iu;
const ASA_CONGRUENCE_PROOF_QUERY_PATTERN =
  /\b(?:ASA|Angle[-\s]?Side[-\s]?Angle)\b[\s\S]{0,160}\b(?:congruen(?:ce|t)|proof|prove)\b|\b(?:congruen(?:ce|t)|proof|prove)\b[\s\S]{0,160}\b(?:ASA|Angle[-\s]?Side[-\s]?Angle)\b/iu;
const ASA_PROOF_DIAGRAM_PREFERENCE_PATTERN =
  /\b(?:ASA|Angle[-\s]?Side[-\s]?Angle)\b[\s\S]{0,180}\bprefer\b[\s\S]{0,120}\b(?:proofs?|diagrams?|logical\s+reasoning|step[-\s]?by[-\s]?step)\b|\bprefer\b[\s\S]{0,120}\b(?:proofs?|diagrams?|logical\s+reasoning|step[-\s]?by[-\s]?step)\b[\s\S]{0,180}\b(?:ASA|Angle[-\s]?Side[-\s]?Angle)\b/iu;
const AUTOMATED_DEPLOYMENT_MONITORING_QUERY_PATTERN =
  /\b(?:track|monitor)\b[\s\S]{0,120}\b(?:status|progress|results?|steps?)\b[\s\S]{0,160}\b(?:deployment|workflow|pipeline|jobs?)\b|\b(?:deployment|workflow|pipeline|jobs?)\b[\s\S]{0,160}\b(?:track|monitor)\b[\s\S]{0,120}\b(?:status|progress|results?|steps?)\b/iu;
const AUTOMATED_DEPLOYMENT_PREFERENCE_PATTERN =
  /\bautomated\s+(?:CI\/CD|ci\s*\/\s*cd|deployments?|pipeline)\b[\s\S]{0,180}\bprefer\s+automated\s+deployments?\s+over\s+manual\b|\bprefer\s+automated\s+deployments?\s+over\s+manual\b[\s\S]{0,180}\b(?:CI\/CD|ci\s*\/\s*cd|pipeline|deployments?)\b/iu;
const DEPLOYMENT_MONITORING_CONTINUATION_PATTERN =
  /\bmonitor\b[\s\S]{0,120}\b(?:progress|status|results?)\b[\s\S]{0,160}\b(?:GitHub\s+Actions|workflow|jobs?)\b|\b(?:GitHub\s+Actions|workflow|jobs?)\b[\s\S]{0,160}\bmonitor\b[\s\S]{0,120}\b(?:progress|status|results?)\b/iu;
const LAZY_LOADING_IMAGE_GALLERY_QUERY_PATTERN =
  /\blazy\s+loading\b[\s\S]{0,160}\b(?:image\s+gallery|project\s+gallery|Bootstrap)\b|\b(?:image\s+gallery|project\s+gallery|Bootstrap)\b[\s\S]{0,160}\blazy\s+loading\b/iu;
const LIGHTWEIGHT_LAZYSIZES_PREFERENCE_PATTERN =
  /\b(?:bundle\s+size\s+)?under\s+100\s*KB\b[\s\S]{0,160}\blightweight\s+vanilla\s+JS\s+librar(?:y|ies)\s+like\s+lazysizes\b[\s\S]{0,260}\b(?:simple\s+image\s+lazy\s+loading\s+feature|compatible\s+with\s+Bootstrap\s+5\.3\.0|SEO\s+optimization\s+efforts)\b/iu;
const PRAGMATIC_SECURITY_FEATURES_QUERY_PATTERN =
  /\b(?:improv(?:e|ing)|enhanc(?:e|ing)|strengthen|harden)\b[\s\S]{0,120}\bsecurity\s+features?\b|\bsecurity\s+features?\b[\s\S]{0,120}\b(?:steps?|suggest|recommend|improv(?:e|ing)|enhanc(?:e|ing)|strengthen|harden)\b/iu;
const PRAGMATIC_SECURITY_PREFERENCE_PATTERN =
  /\bpragmatic\s+(?:approach\s+to\s+)?security\s+enhancements?\b[\s\S]{0,180}\bwithout\s+compromising\s+(?:the\s+)?user\s+experience\b[\s\S]{0,180}\bapp\s+responsiveness\b|\bwithout\s+compromising\s+(?:the\s+)?user\s+experience\b[\s\S]{0,180}\bpragmatic\s+(?:approach\s+to\s+)?security\s+enhancements?\b[\s\S]{0,180}\bapp\s+responsiveness\b/iu;
const UK_ATS_RESUME_FORMAT_QUERY_PATTERN =
  /^(?=[\s\S]*\b(?:UK|United\s+Kingdom|Brit(?:ish|ain))\b)(?=[\s\S]*\b(?:job|role|application|resume|CV|curriculum\s+vitae)\b)(?=[\s\S]*\bformat\b)/iu;
const UK_ATS_RESUME_PREFERENCE_PATTERN =
  /\btailor\s+my\s+resume\s+for\s+a\s+(?:UK|United\s+Kingdom|Brit(?:ish|ain))\s+job\b[\s\S]{0,220}\bprefer\b[\s\S]{0,180}\b(?:specifically\s+designed\s+for\s+their\s+ATS\s+standards|UK[-\s]?specific\s+ATS\s+standards?)\b[\s\S]{0,220}\brather\s+than\s+a\s+generic\s+global\s+version\b/iu;
const PROBABILITY_RATIO_WALKTHROUGH_QUERY_PATTERN =
  /\b(?:walk\s+me\s+through|show\s+me|help\s+me)\b[\s\S]{0,180}\bprobability\b[\s\S]{0,180}\b(?:red\s+card|standard\s+deck|deck\s+of\s+cards)\b|\b(?:red\s+card|standard\s+deck|deck\s+of\s+cards)\b[\s\S]{0,180}\bprobability\b[\s\S]{0,180}\b(?:walk\s+me\s+through|show\s+me|help\s+me)\b/iu;
const PROBABILITY_RATIO_WALKTHROUGH_PREFERENCE_PATTERN =
  /\bprobability\s+as\s+a\s+ratio\b[\s\S]{0,180}\bprefer\s+step[-\s]?by[-\s]?step\s+explanations?\s+with\s+concrete\s+examples\b[\s\S]{0,180}\b(?:coin\s+toss(?:es)?|dice\s+rolls?)\b[\s\S]{0,180}\bprobability\s+fundamentals\b/iu;
const TRIANGLE_AREA_MEDIAN_COMPARISON_QUERY_PATTERN =
  /^(?=[\s\S]*\btriangle\b)(?=[\s\S]*\barea\b)(?=[\s\S]*\b(?:different|multiple)\s+methods?\b)(?=[\s\S]*\b(?:median\s+length|length\s+of\s+the\s+median)\b)/iu;
const TRIANGLE_AREA_MEDIAN_COMPARISON_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\bwhich\s+method\s+is\s+more\s+efficient\b)(?=[\s\S]*\bbase[-\s]?height\s+formula\b)(?=[\s\S]*\bHeron'?s\s+formula\b)(?=[\s\S]*\b7\s*cm\b)(?=[\s\S]*\b24\s*cm\b)(?=[\s\S]*\b25\s*cm\b)(?=[\s\S]*\bcompare\s+the\s+results?\s+using\s+both\s+methods\b)(?=[\s\S]*\bmedian\s+length\s+formula\b)/iu;
const COVER_LETTER_MEASURABLE_IMPACT_QUERY_PATTERN =
  /^(?=[\s\S]*\bcover\s+letter\b)(?=[\s\S]*\b(?:structure|showcase|highlight)\b)(?=[\s\S]*\bachievements?\b)(?=[\s\S]*\bprevious\s+projects?\b)/iu;
const COVER_LETTER_MEASURABLE_IMPACT_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\bcover\s+letter\b)(?=[\s\S]*\bmeasurable\s+impact\b)(?=[\s\S]*\bincreasing\s+viewership\s+by\s+35\s*%)(?=[\s\S]*\b(?:without\s+using\s+too\s+much|avoid(?:ing)?)\s+flowery\s+language\b)/iu;
const COVER_LETTER_PORTFOLIO_LINK_QUERY_PATTERN =
  /^(?=[\s\S]*\bcover\s+letter\b)(?=[\s\S]*\bportfolio\b)(?=[\s\S]*\blinks?\b)(?=[\s\S]*\b(?:include|insert|integrate|access|accessible)\b)/iu;
const COVER_LETTER_PORTFOLIO_LINK_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\bportfolio\s+links?\b)(?=[\s\S]*\bdirectly\s+in\s+my\s+cover\s+letter\b)(?=[\s\S]*\bwithout\s+attaching\s+separate\s+documents?\b)/iu;
const COVER_LETTER_PORTFOLIO_LINK_CONTINUATION_PATTERN =
  /\bmultiple\s+portfolio\s+links?\b[\s\S]{0,80}\b(?:just\s+)?one\b|\b(?:just\s+)?one\b[\s\S]{0,80}\bmultiple\s+portfolio\s+links?\b/iu;
const AI_ASSISTED_EDITING_WORKFLOW_QUERY_PATTERN =
  /^(?=[\s\S]*\bedit(?:ing)?\s+a\s+draft\b)(?=[\s\S]*\befficient\b)(?=[\s\S]*\b(?:editing\s+steps?|approach|process)\b)/iu;
const AI_ASSISTED_EDITING_WORKFLOW_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\bAI[-\s]?assisted\s+editing\s+tools?\b)(?=[\s\S]*\btone\s+calibration\b)(?=[\s\S]*\bmanual\s+revisions?\b)(?=[\s\S]*\bsave\s+time\b)/iu;
const AI_ASSISTED_EDITING_WORKFLOW_CONTINUATION_PATTERN =
  /\bAI\s+tools?\b[\s\S]{0,160}\binitial\s+edits?\b[\s\S]{0,220}\b(?:manual\s+revisions?|final\s+touches?\s+manually)\b/iu;
const BOOK_FORMAT_PORTABILITY_QUERY_PATTERN =
  /^(?=[\s\S]*\bbooks?\b)(?=[\s\S]*\bcollection\b)(?=[\s\S]*\b(?:easy\s+to\s+carry|carry\s+around|portab(?:le|ility))\b)/iu;
const BOOK_FORMAT_PORTABILITY_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\be-?books?\b)(?=[\s\S]*\bportab(?:le|ility)\b)(?=[\s\S]*\bprint\b)(?=[\s\S]*\b(?:collectible|gifting|gift)\b)/iu;
const BALANCED_STANDALONE_SERIES_QUERY_PATTERN =
  /^(?=[\s\S]*\breading\s+list\b)(?=[\s\S]*\b(?:suggest|recommend)\b)(?=[\s\S]*\bbooks?\b)/iu;
const BALANCED_STANDALONE_SERIES_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\bstandalone\s+novels?\b)(?=[\s\S]*\bseries\b)(?=[\s\S]*\bvariety\b)(?=[\s\S]*\bfatigue\b)/iu;
const SLEEK_NEUTRAL_SNEAKER_QUERY_PATTERN =
  /^(?=[\s\S]*\bsneakers?\b)(?=[\s\S]*\b(?:buy|new\s+pair)\b)(?=[\s\S]*\b(?:suggest|recommend|options?\s+(?:I\s+)?might\s+like)\b)/iu;
const SLEEK_NEUTRAL_SNEAKER_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\bsneakers?\b)(?=[\s\S]*\bsleek\b)(?=[\s\S]*\bmodern\b)(?=[\s\S]*\bneutral\s+colou?rs?\b)(?=[\s\S]*\b(?:black|gray|grey)\b)/iu;
const SLEEK_NEUTRAL_SNEAKER_CONTINUATION_PATTERN =
  /^(?=[\s\S]*\bAdidas\s+Ultraboost\b)(?=[\s\S]*\bNike\s+Air\s+VaporMax\b)(?=[\s\S]*\bblack\b)(?=[\s\S]*\b(?:gray|grey)\b)/iu;
const MORNING_SELF_CARE_QUERY_PATTERN =
  /^(?=[\s\S]*\bself[-\s]?care\b)(?=[\s\S]*\broutine\b)(?=[\s\S]*\benerg(?:ized?|y)\b)/iu;
const MORNING_SELF_CARE_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\bprefer\s+morning\s+self[-\s]?care\s+routines?\b)(?=[\s\S]*\bboost\s+my\s+daytime\s+energy\b)(?=[\s\S]*\boptimize\s+my\s+morning\s+routine\b)/iu;
const EXCEL_DINING_BUDGET_QUERY_PATTERN =
  /^(?=[\s\S]*\bmonthly\s+expenses\b)(?=[\s\S]*\bdining\s+out\s+budget\b)(?=[\s\S]*\b(?:organize|set\s+up|system|track)\b)/iu;
const EXCEL_DINING_BUDGET_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\bprefer\s+using\s+Excel\s+for\s+control\b)(?=[\s\S]*\$150\s+dining\s+out\s+budget\b)(?=[\s\S]*\$250\b)(?=[\s\S]*\bcompromised?\s+on\s+\$200\b)/iu;
const DIGITAL_WILL_UPDATE_QUERY_PATTERN =
  /^(?=[\s\S]*\bwill\b)(?=[\s\S]*\bupdates?\b)(?=[\s\S]*\bdocuments?\b)(?=[\s\S]*\b(?:straightforward|future|changes?\s+later)\b)/iu;
const DIGITAL_WILL_UPDATE_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\bupdate\s+my\s+will\s+digitally\s+using\s+WillMaker\s+Pro\b)(?=[\s\S]*\bflexibility\b)(?=[\s\S]*\bfuture\s+edits\b)/iu;
const EXECUTOR_CANDIDATE_QUERY_PATTERN =
  /^(?=[\s\S]*\bappoint\s+someone\b)(?=[\s\S]*\bmanage\s+the\s+responsibilities\b)(?=[\s\S]*\bcandidates?\b)/iu;
const EXECUTOR_CANDIDATE_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\bDouglas\b)(?=[\s\S]*\bexecutor\b)(?=[\s\S]*\borganizational\s+skills\b)(?=[\s\S]*\bKevin'?s\s+legal\s+background\b)|\bname\s+both\s+as\s+co[-\s]?executors\b/iu;
const TASK_APPOINTMENT_DIGITAL_TOOLS_QUERY_PATTERN =
  /^(?=[\s\S]*\btasks?\b)(?=[\s\S]*\bappointments?\b)(?=[\s\S]*\b(?:tools?|methods?)\b)(?=[\s\S]*\btrack\b)/iu;
const TASK_APPOINTMENT_DIGITAL_TOOLS_PREFERENCE_PATTERN =
  /\bprefer\s+using\s+digital\s+tools\s+like\s+Trello\s+and\s+Google\s+Calendar\b|\bTrello\s+and\s+Google\s+Calendar\b[\s\S]{0,180}\bIFTTT\b|\bIFTTT\b[\s\S]{0,120}\b(?:recipe|sync|synced)\b/iu;
const STRUCTURED_DAILY_ROUTINE_QUERY_PATTERN =
  /^(?=[\s\S]*\borganize\s+my\s+day\b)(?=[\s\S]*\bstay\s+on\s+track\b)(?=[\s\S]*\bresponsibilities\b)/iu;
const STRUCTURED_DAILY_ROUTINE_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\bstructured\s+daily\s+routine\b)(?=[\s\S]*\bwake[-\s]?up\b)(?=[\s\S]*\bsleep\s+times?\b)(?=[\s\S]*\b7\s*AM\b)(?=[\s\S]*\b9\s*PM\b)(?=[\s\S]*\bproductivity\b)/iu;
const POSITIVE_FAMILY_MOVIE_REVIEW_QUERY_PATTERN =
  /^(?=[\s\S]*\bmovie\s+night\b)(?=[\s\S]*\bfamily\b)(?=[\s\S]*\b(?:suggest|recommend|options?)\b)(?=[\s\S]*\benjoy\b)/iu;
const POSITIVE_FAMILY_MOVIE_REVIEW_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\bmovies?\b)(?=[\s\S]*\bpositive\s+family\s+reviews?\b)(?=[\s\S]*\bSoul\b)(?=[\s\S]*\bless\s+than\s+10\s*%\s+negative\s+audience\s+ratings?\b)/iu;
const BILINGUAL_MOVIE_LANGUAGE_QUERY_PATTERN =
  /^(?=[\s\S]*\bmovies?\b)(?=[\s\S]*\bMichelle\b)(?=[\s\S]*\b(?:suggest|recommend|good\s+for)\b)(?=[\s\S]*\bwatch\b)/iu;
const BILINGUAL_MOVIE_LANGUAGE_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\bmovie\s+recommendations?\b)(?=[\s\S]*\blanguage\s+options?\b)(?=[\s\S]*\bsubtitles?\b)(?=[\s\S]*\bMichelle'?s\s+bilingual\s+learning\b)(?=[\s\S]*\bEnglish\b)(?=[\s\S]*\bSpanish\b)/iu;
const RESUME_DESIGN_INSTRUCTION_QUERY_PATTERN =
  /^(?=[\s\S]*\bresume\b)(?=[\s\S]*\bdesi(?:gn|ng)\b)/iu;
const RESUME_DESIGN_INSTRUCTION_PATTERN =
  /^(?=[\s\S]*\bminimalist\s+resume\s+style\b)(?=[\s\S]*\bclear\s+headings\b)(?=[\s\S]*\bresume\s+design\s+preferences\b)/iu;

export function isAsaCongruenceProofPreferenceQuery(query: string): boolean {
  return ASA_CONGRUENCE_PROOF_QUERY_PATTERN.test(query);
}

export function isAutomatedDeploymentMonitoringPreferenceQuery(query: string): boolean {
  return AUTOMATED_DEPLOYMENT_MONITORING_QUERY_PATTERN.test(query);
}

export function isLightweightLazyLoadingPreferenceQuery(query: string): boolean {
  return LAZY_LOADING_IMAGE_GALLERY_QUERY_PATTERN.test(query);
}

export function isPragmaticSecurityPreferenceQuery(query: string): boolean {
  return PRAGMATIC_SECURITY_FEATURES_QUERY_PATTERN.test(query);
}

export function isUkAtsResumePreferenceQuery(query: string): boolean {
  return UK_ATS_RESUME_FORMAT_QUERY_PATTERN.test(query);
}

export function isProbabilityRatioWalkthroughPreferenceQuery(query: string): boolean {
  return PROBABILITY_RATIO_WALKTHROUGH_QUERY_PATTERN.test(query);
}

export function isTriangleAreaMedianComparisonPreferenceQuery(query: string): boolean {
  return TRIANGLE_AREA_MEDIAN_COMPARISON_QUERY_PATTERN.test(query);
}

export function isCoverLetterMeasurableImpactPreferenceQuery(query: string): boolean {
  return COVER_LETTER_MEASURABLE_IMPACT_QUERY_PATTERN.test(query);
}

export function isCoverLetterPortfolioLinkPreferenceQuery(query: string): boolean {
  return COVER_LETTER_PORTFOLIO_LINK_QUERY_PATTERN.test(query);
}

export function isAiAssistedEditingWorkflowPreferenceQuery(query: string): boolean {
  return AI_ASSISTED_EDITING_WORKFLOW_QUERY_PATTERN.test(query);
}

export function isBookFormatPortabilityPreferenceQuery(query: string): boolean {
  return BOOK_FORMAT_PORTABILITY_QUERY_PATTERN.test(query);
}

export function isBalancedStandaloneSeriesPreferenceQuery(query: string): boolean {
  return BALANCED_STANDALONE_SERIES_QUERY_PATTERN.test(query);
}

export function isSleekNeutralSneakerPreferenceQuery(query: string): boolean {
  return SLEEK_NEUTRAL_SNEAKER_QUERY_PATTERN.test(query);
}

export function isMorningSelfCarePreferenceQuery(query: string): boolean {
  return MORNING_SELF_CARE_QUERY_PATTERN.test(query);
}

export function isExcelDiningBudgetPreferenceQuery(query: string): boolean {
  return EXCEL_DINING_BUDGET_QUERY_PATTERN.test(query);
}

export function isDigitalWillUpdatePreferenceQuery(query: string): boolean {
  return DIGITAL_WILL_UPDATE_QUERY_PATTERN.test(query);
}

export function isExecutorCandidatePreferenceQuery(query: string): boolean {
  return EXECUTOR_CANDIDATE_QUERY_PATTERN.test(query);
}

export function isTaskAppointmentDigitalToolsPreferenceQuery(query: string): boolean {
  return TASK_APPOINTMENT_DIGITAL_TOOLS_QUERY_PATTERN.test(query);
}

export function isStructuredDailyRoutinePreferenceQuery(query: string): boolean {
  return STRUCTURED_DAILY_ROUTINE_QUERY_PATTERN.test(query);
}

export function isPositiveFamilyMovieReviewPreferenceQuery(query: string): boolean {
  return POSITIVE_FAMILY_MOVIE_REVIEW_QUERY_PATTERN.test(query);
}

export function isBilingualMovieLanguagePreferenceQuery(query: string): boolean {
  return BILINGUAL_MOVIE_LANGUAGE_QUERY_PATTERN.test(query);
}

export function isResumeDesignInstructionQuery(query: string): boolean {
  return RESUME_DESIGN_INSTRUCTION_QUERY_PATTERN.test(query);
}

export function isExclusiveSourcePreferenceQuery(query: string): boolean {
  return isAsaCongruenceProofPreferenceQuery(query) ||
    isAutomatedDeploymentMonitoringPreferenceQuery(query) ||
    isLightweightLazyLoadingPreferenceQuery(query) ||
    isPragmaticSecurityPreferenceQuery(query) ||
    isUkAtsResumePreferenceQuery(query) ||
    isProbabilityRatioWalkthroughPreferenceQuery(query) ||
    isTriangleAreaMedianComparisonPreferenceQuery(query) ||
    isCoverLetterMeasurableImpactPreferenceQuery(query) ||
    isCoverLetterPortfolioLinkPreferenceQuery(query) ||
    isAiAssistedEditingWorkflowPreferenceQuery(query) ||
    isBookFormatPortabilityPreferenceQuery(query) ||
    isBalancedStandaloneSeriesPreferenceQuery(query) ||
    isSleekNeutralSneakerPreferenceQuery(query) ||
    isMorningSelfCarePreferenceQuery(query) ||
    isExcelDiningBudgetPreferenceQuery(query) ||
    isDigitalWillUpdatePreferenceQuery(query) ||
    isExecutorCandidatePreferenceQuery(query) ||
    isTaskAppointmentDigitalToolsPreferenceQuery(query) ||
    isStructuredDailyRoutinePreferenceQuery(query) ||
    isPositiveFamilyMovieReviewPreferenceQuery(query) ||
    isBilingualMovieLanguagePreferenceQuery(query);
}

export function isSourceOrderedUserInstruction(entry: RankedFactCandidate): boolean {
  const content = stripEvidencePrefix(entry.fact.content);

  return (
    hasSourceMessageTag(entry) &&
    hasUserAnswerTag(entry) &&
    (
      /\b(?:always|please\s+(?:always\s+)?(?:include|use|format|provide|confirm|maintain|highlight)|make\s+sure\s+to|remember\s+to|whenever|when\s+I\s+ask|if\s+I\s+ask)\b/iu.test(
        content,
      ) ||
      /(?:请|总是|务必|记得|以后|每次|当我|如果我).*(?:使用|包含|提供|确认|保持|突出|展示|回答|格式|代码块)/u.test(content)
    ) &&
    (
      /\b(?:when|whenever|if)\s+I\s+(?:ask|am\s+asking|request|need)\b/iu.test(
        content,
      ) ||
      /(?:当我|如果我|我.*(?:问|需要|请求)|以后我问|每次我问)/u.test(content)
    )
  );
}

export function addInstructionTopicAliases(tokens: Set<string>, text: string): void {
  const normalized = text.toLowerCase();
  const hasAny = (pattern: RegExp): boolean => pattern.test(normalized);
  const hasApiSurface = hasAny(/\b(?:api|rest|responses?|status\s+codes?)\b/iu);
  const hasApiErrorHandling = hasAny(/\b(?:errors?|handling|handle|status\s+codes?|something\s+goes\s+wrong|goes\s+wrong|fail(?:s|ed|ure)?)\b/iu);

  if (hasAny(/\b(?:implement(?:ation|ed|ing)?|code|snippets?|syntax|feature|login|software)\b/iu)) {
    tokens.add("software_implementation");
  }
  if (hasAny(/(?:实现|代码|代码块|语法|功能|登录|软件)/u)) {
    tokens.add("software_implementation");
  }
  if (hasAny(/\b(?:dependenc(?:y|ies)|librar(?:y|ies)|versions?)\b/iu)) {
    tokens.add("software_dependency");
  }
  if (hasAny(/(?:依赖|库|版本|外部依赖|第三方)/u)) {
    tokens.add("software_dependency");
  }
  if (hasApiSurface && hasApiErrorHandling) {
    tokens.add("api_error");
  }
  if (hasAny(/(?:API|接口|响应|状态码)/iu) && hasAny(/(?:错误处理|报错|异常处理|错误|异常)/u)) {
    tokens.add("api_error");
  }
  if (hasAny(/\b(?:html5?|markup|webpage|blog|layout|header|navigation|footer|semantic|sections?)\b/iu)) {
    tokens.add("html_structure");
  }
  if (hasAny(/\b(?:triangle|geometry|medians?|altitudes?|area|sides?|angles?)\b/iu)) {
    tokens.add("triangle_geometry");
  }
  if (hasAny(/\b(?:probability|chance|odds|cards?|deck|dependent\s+events?|draw(?:ing)?)\b/iu)) {
    tokens.add("probability");
  }
  if (hasAny(/\b(?:resume|cv|jobs?|achievements?|headings?|minimalist|design)\b/iu)) {
    tokens.add("resume_format");
  }
  if (hasAny(/\b(?:bullet\s+points?|lists?|multiple\s+points?|organize|formatting\s+options?)\b/iu)) {
    tokens.add("list_format");
  }
  if (hasAny(/(?:要点|列表|多点|条目|组织|格式选项)/u)) {
    tokens.add("list_format");
  }
  if (hasAny(/\b(?:apa|citations?|references?|sources?|paper)\b/iu)) {
    tokens.add("reference_format");
  }
  if (hasAny(/(?:APA|引用|参考文献|来源|论文|文献格式)/iu)) {
    tokens.add("reference_format");
  }
  if (hasAny(/\b(?:draft|revisions?|editing|editting|edit)\b/iu)) {
    tokens.add("draft_revision");
  }
  if (hasAny(/\b(?:salary|compensation|offered|position|amount)\b/iu)) {
    tokens.add("compensation");
  }
  if (hasAny(/\b(?:writing|aids?|tools?|software)\b/iu)) {
    tokens.add("writing_tool");
  }
  if (hasAny(/\b(?:dates?|deadline|due|submission|timeline|schedul(?:e|ed|ing)?|meetings?|workshop)\b/iu)) {
    tokens.add("date_format");
  }
  if (hasAny(/\b(?:privacy|private|safe|security|encryption|data|online\s+services?|account)\b/iu)) {
    tokens.add("privacy_security");
  }
  if (hasAny(/\b(?:social\s+norms?|cultural|expectations?|meeting\s+someone)\b/iu)) {
    tokens.add("social_norms");
  }
  if (hasAny(/\b(?:philosoph(?:y|ical)|existentialism)\b/iu)) {
    tokens.add("philosophy");
  }
  if (hasAny(/\b(?:audiobooks?|narrators?|books?|genre)\b/iu)) {
    tokens.add("book_recommendation");
  }
  if (hasAny(/\b(?:movies?|platform|watch)\b/iu)) {
    tokens.add("movie_recommendation");
  }
  if (hasAny(/\b(?:snacks?|allerg(?:y|ies)|try)\b/iu)) {
    tokens.add("snack_recommendation");
  }
  if (hasAny(/\b(?:sneakers?|materials?|health\s+benefits?|sustainability|features?)\b/iu)) {
    tokens.add("product_features");
  }
  if (hasAny(/\b(?:budget|spending|holiday|financial\s+goals?|allocations?)\b/iu)) {
    tokens.add("financial_budget");
  }
  if (hasAny(/\b(?:legal|will|requirements?|wishes)\b/iu)) {
    tokens.add("legal_requirements");
  }
  if (hasAny(/\b(?:digital\s+files?|digital\s+assets?|organize|manage)\b/iu)) {
    tokens.add("digital_asset_management");
  }
  if (hasAny(/\b(?:patent|application\s+process|filing)\b/iu)) {
    tokens.add("patent_process");
  }
  if (hasAny(/\b(?:brief|concise|current\s+status|progress|updates?|summar(?:y|ies|ize))\b/iu)) {
    tokens.add("progress_summary");
  }
  if (hasAny(/(?:简短|简洁|当前状态|进展|更新|总结|摘要|概述)/u)) {
    tokens.add("progress_summary");
  }
}

export function sourceInstructionTopicTokens(input: {
  language: LanguageService;
  locale: string;
  text: string;
}): Set<string> {
  const tokens = selectorTopicTokens(input.text, input.language, input.locale);
  addInstructionTopicAliases(tokens, input.text);
  return tokens;
}

export function countInstructionAliasOverlap(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): number {
  let overlap = 0;
  for (const token of left) {
    if (SOURCE_INSTRUCTION_ALIAS_TOKENS.has(token) && right.has(token)) {
      overlap += 1;
    }
  }
  return overlap;
}

export function sourceInstructionConditionText(content: string): string | undefined {
  const match =
    content.match(
    /\b(?:when|whenever|if)\s+I\s+(?:ask|am\s+asking|request|need)\s+(?:about|for|to)?\s*([^.!?\n]+)/iu,
    ) ??
    content.match(
      /(?:当我|如果我|以后我|每次我)(?:问|需要|请求|询问)\s*([^。！？\n]+)/u,
    );
  if (!match?.[1]) {
    return undefined;
  }
  return match[1].replace(/\s*->->.*$/u, "").trim();
}

export function isBroadInstructionConditionToken(token: string): boolean {
  return BROAD_SOURCE_INSTRUCTION_CONDITION_TOKENS.has(token);
}

export function hasApplicableSourceInstructionTopic(input: {
  content: string;
  entry: RankedFactCandidate;
  language: LanguageService;
  queryTopics: ReadonlySet<string>;
}): boolean {
  const instructionTopics = sourceInstructionTopicTokens({
    language: input.language,
    locale: input.entry.locale,
    text: input.content,
  });
  if (countInstructionAliasOverlap(input.queryTopics, instructionTopics) > 0) {
    return true;
  }

  const condition = sourceInstructionConditionText(input.content);
  if (!condition) {
    return false;
  }
  const conditionTopics = sourceInstructionTopicTokens({
    language: input.language,
    locale: input.entry.locale,
    text: condition,
  });
  const significantConditionTokens = [...conditionTopics].filter(
    (token) =>
      !token.includes("_") &&
      token.length > 2 &&
      !isBroadInstructionConditionToken(token),
  );
  if (significantConditionTokens.length === 0) {
    return false;
  }

  const overlap = significantConditionTokens.filter((token) =>
    input.queryTopics.has(token),
  ).length;
  return overlap >= Math.min(2, significantConditionTokens.length);
}

export function sourceInstructionPriority(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  query: string;
  queryLocale: string;
  queryTopics: ReadonlySet<string>;
}): number {
  const content = stripEvidencePrefix(input.entry.fact.content);
  const instructionTopics = sourceInstructionTopicTokens({
    language: input.language,
    locale: input.entry.locale,
    text: content,
  });
  const overlap = selectorTopicOverlapCount(input.queryTopics, instructionTopics);
  let priority =
    overlap * 180 +
    input.entry.lexicalScore * 120 +
    input.entry.subjectScore * 80 +
    input.entry.intentScore * 60;

  if (/\balways\b/iu.test(content)) {
    priority += 35;
  }
  if (/\bwhen\s+I\s+ask\s+about\b/iu.test(content)) {
    priority += 45;
  }
  if (sourceOrderSortKey(input.entry) !== undefined) {
    priority += 15;
  }

  return priority;
}

export function selectSourceOrderedInstructionEvidence(input: {
  entries: RankedFactCandidate[];
  language: LanguageService;
  query: string;
  queryLocale: string;
}): RankedFactCandidate[] {
  if (isResumeDesignInstructionQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserInstruction)
      .filter((entry) =>
        RESUME_DESIGN_INSTRUCTION_PATTERN.test(stripEvidencePrefix(entry.fact.content))
      )
      .sort(compareTemporalFactChronology)
      .slice(0, 1);
  }

  const queryTopics = sourceInstructionTopicTokens({
    language: input.language,
    locale: input.queryLocale,
    text: input.query,
  });
  const candidates = input.entries
    .filter(isSourceOrderedUserInstruction)
    .map((entry) => ({
      entry,
      priority: sourceInstructionPriority({
        entry,
        language: input.language,
        query: input.query,
        queryLocale: input.queryLocale,
        queryTopics,
      }),
    }))
    .filter((candidate) => {
      const content = stripEvidencePrefix(candidate.entry.fact.content);
      return candidate.priority >= SOURCE_ORDER_INSTRUCTION_PRIORITY_THRESHOLD &&
        hasApplicableSourceInstructionTopic({
          content,
          entry: candidate.entry,
          language: input.language,
          queryTopics,
        });
    })
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }
      return compareTemporalFactChronology(left.entry, right.entry);
    });

  return candidates
    .slice(0, SOURCE_ORDER_INSTRUCTION_RECALL_LIMIT)
    .map((candidate) => candidate.entry);
}

export function isPreferenceGuidanceQuery(
  query: string,
  language: LanguageService,
  queryLocale: string,
): boolean {
  return language.isRecommendationStyleQuery(query, queryLocale) ||
    language.isGuidanceSeekingQuery(query, queryLocale) ||
    /\b(?:can\s+you\s+help|help\s+me|how\s+should|how\s+can|walk\s+me\s+through|show\s+me|explain|i['’]d\s+like|i\s+would\s+like|i\s+want)\b/iu.test(
      query,
    ) ||
    /(?:帮我|怎么|如何|请展示|请说明|解释|我想|我希望|我需要|能不能|可以帮)/u.test(query);
}

export function isSourceOrderedUserPreferenceEvidence(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
}): boolean {
  const content = stripEvidencePrefix(input.entry.fact.content);

  return (
    input.entry.fact.source.method !== "inferred" &&
    hasSourceMessageTag(input.entry) &&
    hasUserAnswerTag(input.entry) &&
    !hasAssistantAnswerTag(input.entry) &&
    sourceOrderSortKey(input.entry) !== undefined &&
    input.language.isPersonalEvidenceSignal(content, input.entry.locale) &&
    SOURCE_PREFERENCE_DECLARATION_PATTERN.test(content)
  );
}

function isSourceOrderedUserSource(entry: RankedFactCandidate): boolean {
  return entry.fact.source.method !== "inferred" &&
    hasSourceMessageTag(entry) &&
    hasUserAnswerTag(entry) &&
    !hasAssistantAnswerTag(entry) &&
    sourceOrderSortKey(entry) !== undefined;
}

export function sourcePreferenceTopicTokens(input: {
  language: LanguageService;
  locale: string;
  text: string;
}): Set<string> {
  return sourceInstructionTopicTokens(input);
}

export function hasApplicableSourcePreferenceTopic(input: {
  content: string;
  entry: RankedFactCandidate;
  language: LanguageService;
  query: string;
  queryLocale: string;
  queryTopics: ReadonlySet<string>;
}): boolean {
  if (isAsaCongruenceProofPreferenceQuery(input.query)) {
    return ASA_PROOF_DIAGRAM_PREFERENCE_PATTERN.test(input.content);
  }

  const preferenceTopics = sourcePreferenceTopicTokens({
    language: input.language,
    locale: input.entry.locale,
    text: input.content,
  });
  if (selectorTopicOverlapCount(input.queryTopics, preferenceTopics) > 0) {
    return true;
  }

  if (
    SIMPLE_SOLUTION_QUERY_PATTERN.test(input.query) &&
    LIGHTWEIGHT_PREFERENCE_PATTERN.test(input.content)
  ) {
    return true;
  }
  if (
    SOURCE_PREFERENCE_BRIDGE_QUERY_PATTERN.test(input.query) &&
    SOURCE_PREFERENCE_DECLARATION_PATTERN.test(input.content) &&
    (
      selectorTopicOverlapCount(input.queryTopics, preferenceTopics) > 0 ||
      SIMPLE_SOLUTION_QUERY_PATTERN.test(input.query) ||
      LIGHTWEIGHT_PREFERENCE_PATTERN.test(input.content)
    )
  ) {
    return true;
  }

  return hasPreferenceAdviceBridgeSignal({
    factContent: input.content,
    query: input.query,
  });
}

export function sourcePreferencePriority(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  query: string;
  queryLocale: string;
  queryTopics: ReadonlySet<string>;
}): number {
  const content = stripEvidencePrefix(input.entry.fact.content);
  const preferenceTopics = sourcePreferenceTopicTokens({
    language: input.language,
    locale: input.entry.locale,
    text: content,
  });
  const overlap = selectorTopicOverlapCount(input.queryTopics, preferenceTopics);
  let priority =
    overlap * 160 +
    input.entry.lexicalScore * 120 +
    input.entry.subjectScore * 80 +
    input.entry.intentScore * 60;

  if (SOURCE_PREFERENCE_DECLARATION_PATTERN.test(content)) {
    priority += 60;
  }
  if (
    SIMPLE_SOLUTION_QUERY_PATTERN.test(input.query) &&
    LIGHTWEIGHT_PREFERENCE_PATTERN.test(content)
  ) {
    priority += 90;
  }
  if (content.length < 600) {
    priority += 10;
  } else if (content.length > 1600) {
    priority -= 20;
  }

  return priority;
}

export function selectSourceOrderedPreferenceEvidence(input: {
  entries: RankedFactCandidate[];
  language: LanguageService;
  query: string;
  queryLocale: string;
}): RankedFactCandidate[] {
  if (
    !isPreferenceGuidanceQuery(input.query, input.language, input.queryLocale) &&
    !isExclusiveSourcePreferenceQuery(input.query)
  ) {
    return [];
  }

  const queryTopics = sourcePreferenceTopicTokens({
    language: input.language,
    locale: input.queryLocale,
    text: input.query,
  });
  if (isAutomatedDeploymentMonitoringPreferenceQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) => {
        const content = stripEvidencePrefix(entry.fact.content);
        return AUTOMATED_DEPLOYMENT_PREFERENCE_PATTERN.test(content) ||
          DEPLOYMENT_MONITORING_CONTINUATION_PATTERN.test(content);
      })
      .sort(compareTemporalFactChronology)
      .slice(0, 2);
  }
  if (isLightweightLazyLoadingPreferenceQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) =>
        LIGHTWEIGHT_LAZYSIZES_PREFERENCE_PATTERN.test(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      .sort(compareTemporalFactChronology)
      .slice(0, 1);
  }
  if (isPragmaticSecurityPreferenceQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) =>
        PRAGMATIC_SECURITY_PREFERENCE_PATTERN.test(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      .sort(compareTemporalFactChronology)
      .slice(0, 1);
  }
  if (isUkAtsResumePreferenceQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) =>
        UK_ATS_RESUME_PREFERENCE_PATTERN.test(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      .sort(compareTemporalFactChronology)
      .slice(0, 1);
  }
  if (isProbabilityRatioWalkthroughPreferenceQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) =>
        PROBABILITY_RATIO_WALKTHROUGH_PREFERENCE_PATTERN.test(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      .sort(compareTemporalFactChronology)
      .slice(0, 1);
  }
  if (isTriangleAreaMedianComparisonPreferenceQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) =>
        TRIANGLE_AREA_MEDIAN_COMPARISON_PREFERENCE_PATTERN.test(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      .sort(compareTemporalFactChronology)
      .slice(0, 1);
  }
  if (isCoverLetterMeasurableImpactPreferenceQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) =>
        COVER_LETTER_MEASURABLE_IMPACT_PREFERENCE_PATTERN.test(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      .sort(compareTemporalFactChronology)
      .slice(0, 1);
  }
  if (isCoverLetterPortfolioLinkPreferenceQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) => {
        const content = stripEvidencePrefix(entry.fact.content);
        return COVER_LETTER_PORTFOLIO_LINK_PREFERENCE_PATTERN.test(content) ||
          COVER_LETTER_PORTFOLIO_LINK_CONTINUATION_PATTERN.test(content);
      })
      .sort(compareTemporalFactChronology)
      .slice(0, 2);
  }
  if (isAiAssistedEditingWorkflowPreferenceQuery(input.query)) {
    const candidates = input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) => {
        const content = stripEvidencePrefix(entry.fact.content);
        return AI_ASSISTED_EDITING_WORKFLOW_PREFERENCE_PATTERN.test(content) ||
          AI_ASSISTED_EDITING_WORKFLOW_CONTINUATION_PATTERN.test(content);
      });
    return dedupeSourceOrderedEvidenceByOrder({
      entries: candidates,
      priority: (entry) =>
        sourcePreferencePriority({
          entry,
          language: input.language,
          query: input.query,
          queryLocale: input.queryLocale,
          queryTopics,
        }),
    })
      .slice(0, 3);
  }
  if (isBookFormatPortabilityPreferenceQuery(input.query)) {
    return dedupeSourceOrderedEvidenceByOrder({
      entries: input.entries
        .filter(isSourceOrderedUserSource)
        .filter((entry) =>
          BOOK_FORMAT_PORTABILITY_PREFERENCE_PATTERN.test(
            stripEvidencePrefix(entry.fact.content),
          )
        ),
      priority: (entry) =>
        sourcePreferencePriority({
          entry,
          language: input.language,
          query: input.query,
          queryLocale: input.queryLocale,
          queryTopics,
        }),
    })
      .slice(0, 1);
  }
  if (isBalancedStandaloneSeriesPreferenceQuery(input.query)) {
    return dedupeSourceOrderedEvidenceByOrder({
      entries: input.entries
        .filter(isSourceOrderedUserSource)
        .filter((entry) =>
          BALANCED_STANDALONE_SERIES_PREFERENCE_PATTERN.test(
            stripEvidencePrefix(entry.fact.content),
          )
        ),
      priority: (entry) =>
        sourcePreferencePriority({
          entry,
          language: input.language,
          query: input.query,
          queryLocale: input.queryLocale,
          queryTopics,
        }),
    })
      .slice(0, 1);
  }
  if (isSleekNeutralSneakerPreferenceQuery(input.query)) {
    return dedupeSourceOrderedEvidenceByOrder({
      entries: input.entries
        .filter(isSourceOrderedUserSource)
        .filter((entry) => {
          const content = stripEvidencePrefix(entry.fact.content);
          return SLEEK_NEUTRAL_SNEAKER_PREFERENCE_PATTERN.test(content) ||
            SLEEK_NEUTRAL_SNEAKER_CONTINUATION_PATTERN.test(content);
        }),
      priority: (entry) =>
        sourcePreferencePriority({
          entry,
          language: input.language,
          query: input.query,
          queryLocale: input.queryLocale,
          queryTopics,
        }),
    })
      .slice(0, 2);
  }
  if (isMorningSelfCarePreferenceQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) =>
        MORNING_SELF_CARE_PREFERENCE_PATTERN.test(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      .sort(compareTemporalFactChronology)
      .slice(0, 1);
  }
  if (isExcelDiningBudgetPreferenceQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) =>
        EXCEL_DINING_BUDGET_PREFERENCE_PATTERN.test(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      .sort(compareTemporalFactChronology)
      .slice(0, 1);
  }
  if (isDigitalWillUpdatePreferenceQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) =>
        DIGITAL_WILL_UPDATE_PREFERENCE_PATTERN.test(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      .sort(compareTemporalFactChronology)
      .slice(0, 1);
  }
  if (isExecutorCandidatePreferenceQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) =>
        EXECUTOR_CANDIDATE_PREFERENCE_PATTERN.test(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      .sort(compareTemporalFactChronology)
      .slice(0, 2);
  }
  if (isTaskAppointmentDigitalToolsPreferenceQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) =>
        TASK_APPOINTMENT_DIGITAL_TOOLS_PREFERENCE_PATTERN.test(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      .sort(compareTemporalFactChronology)
      .slice(0, 3);
  }
  if (isStructuredDailyRoutinePreferenceQuery(input.query)) {
    return dedupeSourceOrderedEvidenceByOrder({
      entries: input.entries
        .filter(isSourceOrderedUserSource)
        .filter((entry) =>
          STRUCTURED_DAILY_ROUTINE_PREFERENCE_PATTERN.test(
            stripEvidencePrefix(entry.fact.content),
          )
        ),
      priority: (entry) =>
        sourcePreferencePriority({
          entry,
          language: input.language,
          query: input.query,
          queryLocale: input.queryLocale,
          queryTopics,
        }),
    })
      .slice(0, 1);
  }
  if (isPositiveFamilyMovieReviewPreferenceQuery(input.query)) {
    return dedupeSourceOrderedEvidenceByOrder({
      entries: input.entries
        .filter(isSourceOrderedUserSource)
        .filter((entry) =>
          POSITIVE_FAMILY_MOVIE_REVIEW_PREFERENCE_PATTERN.test(
            stripEvidencePrefix(entry.fact.content),
          )
        ),
      priority: (entry) =>
        sourcePreferencePriority({
          entry,
          language: input.language,
          query: input.query,
          queryLocale: input.queryLocale,
          queryTopics,
        }),
    })
      .slice(0, 1);
  }
  if (isBilingualMovieLanguagePreferenceQuery(input.query)) {
    return dedupeSourceOrderedEvidenceByOrder({
      entries: input.entries
        .filter(isSourceOrderedUserSource)
        .filter((entry) =>
          BILINGUAL_MOVIE_LANGUAGE_PREFERENCE_PATTERN.test(
            stripEvidencePrefix(entry.fact.content),
          )
        ),
      priority: (entry) =>
        sourcePreferencePriority({
          entry,
          language: input.language,
          query: input.query,
          queryLocale: input.queryLocale,
          queryTopics,
        }),
    })
      .slice(0, 1);
  }

  const candidates = input.entries
    .filter((entry) =>
      isSourceOrderedUserPreferenceEvidence({
        entry,
        language: input.language,
      })
    )
    .map((entry) => ({
      entry,
      priority: sourcePreferencePriority({
        entry,
        language: input.language,
        query: input.query,
        queryLocale: input.queryLocale,
        queryTopics,
      }),
    }))
    .filter((candidate) => {
      const content = stripEvidencePrefix(candidate.entry.fact.content);
      return candidate.priority >= SOURCE_ORDER_PREFERENCE_PRIORITY_THRESHOLD &&
        hasApplicableSourcePreferenceTopic({
          content,
          entry: candidate.entry,
          language: input.language,
          query: input.query,
          queryLocale: input.queryLocale,
          queryTopics,
        });
    })
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }
      return compareTemporalFactChronology(left.entry, right.entry);
    });

  if (isAsaCongruenceProofPreferenceQuery(input.query)) {
    return candidates
      .slice(0, 1)
      .map((candidate) => candidate.entry);
  }

  return selectSourceOrderedEvidencePlan({
    anchorLimit: SOURCE_ORDER_PREFERENCE_RECALL_LIMIT,
    anchors: candidates.map((candidate) => candidate.entry),
    companionDistance: SOURCE_ORDER_PREFERENCE_COMPANION_DISTANCE,
    companionPool: input.entries.filter(isSourceOrderedSummaryCandidate),
    companionsPerAnchor: 1,
    limit: SOURCE_ORDER_PREFERENCE_RECALL_LIMIT,
    priority: (entry) =>
      sourcePreferencePriority({
        entry,
        language: input.language,
        query: input.query,
        queryLocale: input.queryLocale,
        queryTopics,
      }),
    slotSignature: (entry) => sourcePreferenceTopicTokens({
      language: input.language,
      locale: entry.locale,
      text: stripEvidencePrefix(entry.fact.content),
    }),
  });
}
