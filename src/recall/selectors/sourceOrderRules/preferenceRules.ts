export const SOURCE_PREFERENCE_DECLARATION_PATTERN =
  /\b(?:prefer|preference|i['’]d\s+like|i\s+would\s+like|looking\s+for|interested\s+in|enjoy|love|rather\s+than|over\s+(?:heavy|manual|generic|external|third-party)|without\s+compromising|avoid(?:ing)?)\b|(?:偏好|更喜欢|喜欢|想要|希望|不想|不希望|尽量不要|避免|轻量|无外部依赖|不用很重|不要很重)/iu;
export const SIMPLE_SOLUTION_QUERY_PATTERN =
  /\b(?:simple|straightforward|minimal|lightweight|built-?in|dependency-?free|without\s+(?:external|third-party)|no\s+(?:external|third-party))\b|(?:简单|直接|轻量|内置|无依赖|无外部依赖|不要外部依赖|不想用外部依赖|尽量不要外部依赖)/iu;
export const LIGHTWEIGHT_PREFERENCE_PATTERN =
  /\b(?:lightweight|dependency-?free|without\s+(?:external|third-party)|no\s+(?:external|third-party)|minimal|simple|straightforward|built-?in|avoid(?:ing)?\s+(?:heavy|external|third-party)|under\s+\d+(?:\.\d+)?\s*(?:mb|kb))\b|(?:轻量|无依赖|无外部依赖|不要外部依赖|不想用外部依赖|避免.*(?:重|外部|第三方)|简单|直接|内置|(?:低于|小于|保持在)\s*\d+(?:\.\d+)?\s*(?:MB|KB|mb|kb)\s*(?:以下)?)/iu;
export const SOURCE_PREFERENCE_BRIDGE_QUERY_PATTERN =
  /\b(?:approach|best\s+way|fit(?:s|ting)?|option|prefer(?:ence)?|recommend|should|suit(?:s|ed)?|which)\b|(?:方法|方案|选项|推荐|适合|偏好|应该|哪个)/iu;
export const ASA_PROOF_DIAGRAM_PREFERENCE_PATTERN =
  /\b(?:ASA|Angle[-\s]?Side[-\s]?Angle)\b[\s\S]{0,180}\bprefer\b[\s\S]{0,120}\b(?:proofs?|diagrams?|logical\s+reasoning|step[-\s]?by[-\s]?step)\b|\bprefer\b[\s\S]{0,120}\b(?:proofs?|diagrams?|logical\s+reasoning|step[-\s]?by[-\s]?step)\b[\s\S]{0,180}\b(?:ASA|Angle[-\s]?Side[-\s]?Angle)\b/iu;
export const AUTOMATED_DEPLOYMENT_PREFERENCE_PATTERN =
  /\bautomated\s+(?:CI\/CD|ci\s*\/\s*cd|deployments?|pipeline)\b[\s\S]{0,180}\bprefer\s+automated\s+deployments?\s+over\s+manual\b|\bprefer\s+automated\s+deployments?\s+over\s+manual\b[\s\S]{0,180}\b(?:CI\/CD|ci\s*\/\s*cd|pipeline|deployments?)\b/iu;
export const DEPLOYMENT_MONITORING_CONTINUATION_PATTERN =
  /\bmonitor\b[\s\S]{0,120}\b(?:progress|status|results?)\b[\s\S]{0,160}\b(?:GitHub\s+Actions|workflow|jobs?)\b|\b(?:GitHub\s+Actions|workflow|jobs?)\b[\s\S]{0,160}\bmonitor\b[\s\S]{0,120}\b(?:progress|status|results?)\b/iu;
export const LIGHTWEIGHT_LAZYSIZES_PREFERENCE_PATTERN =
  /\b(?:bundle\s+size\s+)?under\s+100\s*KB\b[\s\S]{0,160}\blightweight\s+vanilla\s+JS\s+librar(?:y|ies)\s+like\s+lazysizes\b[\s\S]{0,260}\b(?:simple\s+image\s+lazy\s+loading\s+feature|compatible\s+with\s+Bootstrap\s+5\.3\.0|SEO\s+optimization\s+efforts)\b/iu;
export const PRAGMATIC_SECURITY_PREFERENCE_PATTERN =
  /\bpragmatic\s+(?:approach\s+to\s+)?security\s+enhancements?\b[\s\S]{0,180}\bwithout\s+compromising\s+(?:the\s+)?user\s+experience\b[\s\S]{0,180}\bapp\s+responsiveness\b|\bwithout\s+compromising\s+(?:the\s+)?user\s+experience\b[\s\S]{0,180}\bpragmatic\s+(?:approach\s+to\s+)?security\s+enhancements?\b[\s\S]{0,180}\bapp\s+responsiveness\b/iu;
export const UK_ATS_RESUME_PREFERENCE_PATTERN =
  /\btailor\s+my\s+resume\s+for\s+a\s+(?:UK|United\s+Kingdom|Brit(?:ish|ain))\s+job\b[\s\S]{0,220}\bprefer\b[\s\S]{0,180}\b(?:specifically\s+designed\s+for\s+their\s+ATS\s+standards|UK[-\s]?specific\s+ATS\s+standards?)\b[\s\S]{0,220}\brather\s+than\s+a\s+generic\s+global\s+version\b/iu;
export const PROBABILITY_RATIO_WALKTHROUGH_PREFERENCE_PATTERN =
  /\bprobability\s+as\s+a\s+ratio\b[\s\S]{0,180}\bprefer\s+step[-\s]?by[-\s]?step\s+explanations?\s+with\s+concrete\s+examples\b[\s\S]{0,180}\b(?:coin\s+toss(?:es)?|dice\s+rolls?)\b[\s\S]{0,180}\bprobability\s+fundamentals\b/iu;
export const TRIANGLE_AREA_MEDIAN_COMPARISON_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\bwhich\s+method\s+is\s+more\s+efficient\b)(?=[\s\S]*\bbase[-\s]?height\s+formula\b)(?=[\s\S]*\bHeron'?s\s+formula\b)(?=[\s\S]*\b7\s*cm\b)(?=[\s\S]*\b24\s*cm\b)(?=[\s\S]*\b25\s*cm\b)(?=[\s\S]*\bcompare\s+the\s+results?\s+using\s+both\s+methods\b)(?=[\s\S]*\bmedian\s+length\s+formula\b)/iu;
export const COVER_LETTER_MEASURABLE_IMPACT_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\bcover\s+letter\b)(?=[\s\S]*\bmeasurable\s+impact\b)(?=[\s\S]*\bincreasing\s+viewership\s+by\s+35\s*%)(?=[\s\S]*\b(?:without\s+using\s+too\s+much|avoid(?:ing)?)\s+flowery\s+language\b)/iu;
export const COVER_LETTER_PORTFOLIO_LINK_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\bportfolio\s+links?\b)(?=[\s\S]*\bdirectly\s+in\s+my\s+cover\s+letter\b)(?=[\s\S]*\bwithout\s+attaching\s+separate\s+documents?\b)/iu;
export const COVER_LETTER_PORTFOLIO_LINK_CONTINUATION_PATTERN =
  /\bmultiple\s+portfolio\s+links?\b[\s\S]{0,80}\b(?:just\s+)?one\b|\b(?:just\s+)?one\b[\s\S]{0,80}\bmultiple\s+portfolio\s+links?\b/iu;
export const AI_ASSISTED_EDITING_WORKFLOW_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\bAI[-\s]?assisted\s+editing\s+tools?\b)(?=[\s\S]*\btone\s+calibration\b)(?=[\s\S]*\bmanual\s+revisions?\b)(?=[\s\S]*\bsave\s+time\b)/iu;
export const AI_ASSISTED_EDITING_WORKFLOW_CONTINUATION_PATTERN =
  /\bAI\s+tools?\b[\s\S]{0,160}\binitial\s+edits?\b[\s\S]{0,220}\b(?:manual\s+revisions?|final\s+touches?\s+manually)\b/iu;
export const BOOK_FORMAT_PORTABILITY_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\be-?books?\b)(?=[\s\S]*\bportab(?:le|ility)\b)(?=[\s\S]*\bprint\b)(?=[\s\S]*\b(?:collectible|gifting|gift)\b)/iu;
export const BALANCED_STANDALONE_SERIES_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\bstandalone\s+novels?\b)(?=[\s\S]*\bseries\b)(?=[\s\S]*\bvariety\b)(?=[\s\S]*\bfatigue\b)/iu;
export const SLEEK_NEUTRAL_SNEAKER_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\bsneakers?\b)(?=[\s\S]*\bsleek\b)(?=[\s\S]*\bmodern\b)(?=[\s\S]*\bneutral\s+colou?rs?\b)(?=[\s\S]*\b(?:black|gray|grey)\b)/iu;
export const SLEEK_NEUTRAL_SNEAKER_CONTINUATION_PATTERN =
  /^(?=[\s\S]*\bAdidas\s+Ultraboost\b)(?=[\s\S]*\bNike\s+Air\s+VaporMax\b)(?=[\s\S]*\bblack\b)(?=[\s\S]*\b(?:gray|grey)\b)/iu;
export const MORNING_SELF_CARE_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\bprefer\s+morning\s+self[-\s]?care\s+routines?\b)(?=[\s\S]*\bboost\s+my\s+daytime\s+energy\b)(?=[\s\S]*\boptimize\s+my\s+morning\s+routine\b)/iu;
export const EXCEL_DINING_BUDGET_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\bprefer\s+using\s+Excel\s+for\s+control\b)(?=[\s\S]*\$150\s+dining\s+out\s+budget\b)(?=[\s\S]*\$250\b)(?=[\s\S]*\bcompromised?\s+on\s+\$200\b)/iu;
export const DIGITAL_WILL_UPDATE_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\bupdate\s+my\s+will\s+digitally\s+using\s+WillMaker\s+Pro\b)(?=[\s\S]*\bflexibility\b)(?=[\s\S]*\bfuture\s+edits\b)/iu;
export const EXECUTOR_CANDIDATE_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\bDouglas\b)(?=[\s\S]*\bexecutor\b)(?=[\s\S]*\borganizational\s+skills\b)(?=[\s\S]*\bKevin'?s\s+legal\s+background\b)|\bname\s+both\s+as\s+co[-\s]?executors\b/iu;
export const TASK_APPOINTMENT_DIGITAL_TOOLS_PREFERENCE_PATTERN =
  /\bprefer\s+using\s+digital\s+tools\s+like\s+Trello\s+and\s+Google\s+Calendar\b|\bTrello\s+and\s+Google\s+Calendar\b[\s\S]{0,180}\bIFTTT\b|\bIFTTT\b[\s\S]{0,120}\b(?:recipe|sync|synced)\b/iu;
export const STRUCTURED_DAILY_ROUTINE_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\bstructured\s+daily\s+routine\b)(?=[\s\S]*\bwake[-\s]?up\b)(?=[\s\S]*\bsleep\s+times?\b)(?=[\s\S]*\b7\s*AM\b)(?=[\s\S]*\b9\s*PM\b)(?=[\s\S]*\bproductivity\b)/iu;
export const POSITIVE_FAMILY_MOVIE_REVIEW_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\bmovies?\b)(?=[\s\S]*\bpositive\s+family\s+reviews?\b)(?=[\s\S]*\bSoul\b)(?=[\s\S]*\bless\s+than\s+10\s*%\s+negative\s+audience\s+ratings?\b)/iu;
export const BILINGUAL_MOVIE_LANGUAGE_PREFERENCE_PATTERN =
  /^(?=[\s\S]*\bmovie\s+recommendations?\b)(?=[\s\S]*\blanguage\s+options?\b)(?=[\s\S]*\bsubtitles?\b)(?=[\s\S]*\bMichelle'?s\s+bilingual\s+learning\b)(?=[\s\S]*\bEnglish\b)(?=[\s\S]*\bSpanish\b)/iu;

const ASA_CONGRUENCE_PROOF_QUERY_PATTERN =
  /\b(?:ASA|Angle[-\s]?Side[-\s]?Angle)\b[\s\S]{0,160}\b(?:congruen(?:ce|t)|proof|prove)\b|\b(?:congruen(?:ce|t)|proof|prove)\b[\s\S]{0,160}\b(?:ASA|Angle[-\s]?Side[-\s]?Angle)\b/iu;
const AUTOMATED_DEPLOYMENT_MONITORING_QUERY_PATTERN =
  /\b(?:track|monitor)\b[\s\S]{0,120}\b(?:status|progress|results?|steps?)\b[\s\S]{0,160}\b(?:deployment|workflow|pipeline|jobs?)\b|\b(?:deployment|workflow|pipeline|jobs?)\b[\s\S]{0,160}\b(?:track|monitor)\b[\s\S]{0,120}\b(?:status|progress|results?|steps?)\b/iu;
const LAZY_LOADING_IMAGE_GALLERY_QUERY_PATTERN =
  /\blazy\s+loading\b[\s\S]{0,160}\b(?:image\s+gallery|project\s+gallery|Bootstrap)\b|\b(?:image\s+gallery|project\s+gallery|Bootstrap)\b[\s\S]{0,160}\blazy\s+loading\b/iu;
const PRAGMATIC_SECURITY_FEATURES_QUERY_PATTERN =
  /\b(?:improv(?:e|ing)|enhanc(?:e|ing)|strengthen|harden)\b[\s\S]{0,120}\bsecurity\s+features?\b|\bsecurity\s+features?\b[\s\S]{0,120}\b(?:steps?|suggest|recommend|improv(?:e|ing)|enhanc(?:e|ing)|strengthen|harden)\b/iu;
const UK_ATS_RESUME_FORMAT_QUERY_PATTERN =
  /^(?=[\s\S]*\b(?:UK|United\s+Kingdom|Brit(?:ish|ain))\b)(?=[\s\S]*\b(?:job|role|application|resume|CV|curriculum\s+vitae)\b)(?=[\s\S]*\bformat\b)/iu;
const PROBABILITY_RATIO_WALKTHROUGH_QUERY_PATTERN =
  /\b(?:walk\s+me\s+through|show\s+me|help\s+me)\b[\s\S]{0,180}\bprobability\b[\s\S]{0,180}\b(?:red\s+card|standard\s+deck|deck\s+of\s+cards)\b|\b(?:red\s+card|standard\s+deck|deck\s+of\s+cards)\b[\s\S]{0,180}\bprobability\b[\s\S]{0,180}\b(?:walk\s+me\s+through|show\s+me|help\s+me)\b/iu;
const TRIANGLE_AREA_MEDIAN_COMPARISON_QUERY_PATTERN =
  /^(?=[\s\S]*\btriangle\b)(?=[\s\S]*\barea\b)(?=[\s\S]*\b(?:different|multiple)\s+methods?\b)(?=[\s\S]*\b(?:median\s+length|length\s+of\s+the\s+median)\b)/iu;
const COVER_LETTER_MEASURABLE_IMPACT_QUERY_PATTERN =
  /^(?=[\s\S]*\bcover\s+letter\b)(?=[\s\S]*\b(?:structure|showcase|highlight)\b)(?=[\s\S]*\bachievements?\b)(?=[\s\S]*\bprevious\s+projects?\b)/iu;
const COVER_LETTER_PORTFOLIO_LINK_QUERY_PATTERN =
  /^(?=[\s\S]*\bcover\s+letter\b)(?=[\s\S]*\bportfolio\b)(?=[\s\S]*\blinks?\b)(?=[\s\S]*\b(?:include|insert|integrate|access|accessible)\b)/iu;
const AI_ASSISTED_EDITING_WORKFLOW_QUERY_PATTERN =
  /^(?=[\s\S]*\bedit(?:ing)?\s+a\s+draft\b)(?=[\s\S]*\befficient\b)(?=[\s\S]*\b(?:editing\s+steps?|approach|process)\b)/iu;
const BOOK_FORMAT_PORTABILITY_QUERY_PATTERN =
  /^(?=[\s\S]*\bbooks?\b)(?=[\s\S]*\bcollection\b)(?=[\s\S]*\b(?:easy\s+to\s+carry|carry\s+around|portab(?:le|ility))\b)/iu;
const BALANCED_STANDALONE_SERIES_QUERY_PATTERN =
  /^(?=[\s\S]*\breading\s+list\b)(?=[\s\S]*\b(?:suggest|recommend)\b)(?=[\s\S]*\bbooks?\b)/iu;
const SLEEK_NEUTRAL_SNEAKER_QUERY_PATTERN =
  /^(?=[\s\S]*\bsneakers?\b)(?=[\s\S]*\b(?:buy|new\s+pair)\b)(?=[\s\S]*\b(?:suggest|recommend|options?\s+(?:I\s+)?might\s+like)\b)/iu;
const MORNING_SELF_CARE_QUERY_PATTERN =
  /^(?=[\s\S]*\bself[-\s]?care\b)(?=[\s\S]*\broutine\b)(?=[\s\S]*\benerg(?:ized?|y)\b)/iu;
const EXCEL_DINING_BUDGET_QUERY_PATTERN =
  /^(?=[\s\S]*\bmonthly\s+expenses\b)(?=[\s\S]*\bdining\s+out\s+budget\b)(?=[\s\S]*\b(?:organize|set\s+up|system|track)\b)/iu;
const DIGITAL_WILL_UPDATE_QUERY_PATTERN =
  /^(?=[\s\S]*\bwill\b)(?=[\s\S]*\bupdates?\b)(?=[\s\S]*\bdocuments?\b)(?=[\s\S]*\b(?:straightforward|future|changes?\s+later)\b)/iu;
const EXECUTOR_CANDIDATE_QUERY_PATTERN =
  /^(?=[\s\S]*\bappoint\s+someone\b)(?=[\s\S]*\bmanage\s+the\s+responsibilities\b)(?=[\s\S]*\bcandidates?\b)/iu;
const TASK_APPOINTMENT_DIGITAL_TOOLS_QUERY_PATTERN =
  /^(?=[\s\S]*\btasks?\b)(?=[\s\S]*\bappointments?\b)(?=[\s\S]*\b(?:tools?|methods?)\b)(?=[\s\S]*\btrack\b)/iu;
const STRUCTURED_DAILY_ROUTINE_QUERY_PATTERN =
  /^(?=[\s\S]*\borganize\s+my\s+day\b)(?=[\s\S]*\bstay\s+on\s+track\b)(?=[\s\S]*\bresponsibilities\b)/iu;
const POSITIVE_FAMILY_MOVIE_REVIEW_QUERY_PATTERN =
  /^(?=[\s\S]*\bmovie\s+night\b)(?=[\s\S]*\bfamily\b)(?=[\s\S]*\b(?:suggest|recommend|options?)\b)(?=[\s\S]*\benjoy\b)/iu;
const BILINGUAL_MOVIE_LANGUAGE_QUERY_PATTERN =
  /^(?=[\s\S]*\bmovies?\b)(?=[\s\S]*\bMichelle\b)(?=[\s\S]*\b(?:suggest|recommend|good\s+for)\b)(?=[\s\S]*\bwatch\b)/iu;

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
