import type {
  LanguageContentAnalysis,
  LanguageEntityCandidateInput,
  LanguageEntityMention,
  LanguageQueryAnalysis,
  LanguageRenderInput,
  LanguageTemporalExpression,
} from "./contracts";
import {
  decomposeQueryByPattern,
  extractPatternMentions,
  parsePatternTemporalExpressions,
  parseTechnicalTemporalExpressions,
  renderFromCatalog,
  resolveSourceOfTruthDirective,
} from "./packHelpers";

const QUERY = {
  after: /\b(?:after|since)\b/i,
  actionDriving:
    /\b(proceed|send|ship|deploy|decide|rollout|execute|edit(?:ing|ed|s)?|chang(?:e|ing|ed|es)|delet(?:e|ing|ed|es)|publish(?:ing|ed|es)?|run(?:ning|s)?|writ(?:e|ing|ten|es)|migration plan|next step|do next)\b/i,
  aggregateCount:
    /\bhow many\b|\bhow much\b|\b(?:total money|cost|costs|paid|price|dollars?)\b|\b(?:spend|spent)\b[^.!?]{0,80}\b(?:in total|altogether)\b|\b(?:add up|sum|total)\b[^.!?]{0,80}\b(?:spend|spent)\b/i,
  answer: /\b(answer|respond|reply|user|summari[sz]e|summary|compose|draft)\b/i,
  assistantEvidenceRecall:
    /\b(?:previous|earlier|last time|talked about|discussed|you (?:told|said|suggested|recommended|provided)|list you provided|remind me)\b/i,
  blocker: /\b(blocker|blocked|blocking|approval)\b/i,
  before: /\b(?:before|prior to)\b/i,
  change:
    /\b(?:change(?:d|s)?|replac(?:e|ed)|switch(?:ed)?|used to|no longer)\b/i,
  confirm: /\bconfirm\b/i,
  continuation:
    /\b(continue|resume|last time|from last time|carry on)\b|\bpick up\s+(?:where we left off|from last time|this thread|the thread|this task|the task)\b/i,
  directFactualLookup:
    /^(?:who|where|when|which|what|did|do|does|was|were|is|are|am|can you remind me|remind me)\b|^how\s+(?:much|many|long|old|far|often)\b/i,
  factConfirmationTarget:
    /\b(role|focus|open loop|blocker|handoff|approval|package|signoff|verification)\b/i,
  focus: /\bfocus\b/i,
  exhaustiveList:
    /\b(?:all|list|which|what|open loops?|pending|remaining|to-?dos?)\b/i,
  current: /\b(?:current|currently|latest|now|present)\b/i,
  guidanceSeeking:
    /\b(prefer|preference|style|tone|format|guidance|rule|rules|instruction|instructions|respond|reply|how should|should i|should you|should be|avoid|do not|don't|remember to)\b/i,
  openLoop:
    /\b(open loop|handoff|signoff|verification|todo|to-do|need to|have to|pick up)\b|\bhow many\b.*\breturn\b/i,
  projectState:
    /\b(project|workflow|migration|rollout|approval|blocker|blocked|open loop|handoff|signoff|verification|prod|production)\b/i,
  recommendationStyle:
    /\b(?:recommend|suggest(?:ions?)?|advice|ideas?|tips?|what should|what can i|where should)\b/i,
  reference: /\b(runbook|guide|doc|docs|reference|source of truth)\b/i,
  history: /\b(?:historical|history|previously|timeline|over time)\b/i,
  procedural:
    /\b(?:how (?:do|can|should) i|steps?|procedure|runbook|workflow|instructions?)\b/i,
  relation:
    /\b(?:known for|associated with|connected to|related to|reports to|mentored by)\b/i,
  role: /\brole\b/i,
} as const;

const CONTENT = {
  assistantAck:
    /^(understood|noted|captured|okay|ok|will do|done|thanks|thank you|updated)\.?$/i,
  assistantContinuity:
    /\b(will|going forward|use|continue|updated|confirm|propos|next step|resolved|pending|blocked|follow up|keep)\b/i,
  blockerFact: /\bblocker\b|\bblocked\b|\bblocking\b|\bapproval\b/i,
  correctionCue:
    /\b(?:correction|replace|replaced|supersede|superseded|instead of|use .+ as the source of truth|not .+ source of truth)\b/i,
  dont: /\b(don't|do not)\b/i,
  durableCue:
    /\b(?:remember that|source of truth|runbook|current blocker|blocked|blocking|prefer|please keep|my current role|my role|my timezone|preferred language|current focus|current project|use .+ instead of|instead of)\b/i,
  focusFact:
    /\bmy current focus is\b|\bi(?:'m| am)\s+(?:leading|working on|focused on|owning)\b/i,
  negative: /\b(blocked|failing|open|unstable)\b/i,
  openLoopFact:
    /\bopen loop\b|\bi\s+(?:(?:still|also|just)\s+)?(?:need|have)\s+to\b|\bi(?:'ve| have)\s+been\s+meaning\s+to\b/i,
  personalEvidence: /\b(?:i|my|me|mine|i'm|i've|i'd)\b/i,
  positive: /\b(stable|resolved|closed|fixed|completed)\b/i,
  preferenceEvidence:
    /\b(?:prefer|like|love|enjoy|want|looking for|interested in|miss|struggling|trying to|issue|issues|problem|problems|leak|leaking|scratch|scratches|clutter|clutter-free)\b/i,
  prefer: /\bprefer\b/i,
  projectStateFact:
    /\b(next milestone|next step|next action|upcoming milestone|pending|waiting|remaining|still needs?|needs? review|needs? confirmation|needs? follow(?:-| )?up)\b/i,
  roleFact:
    /\bmy current role is\b|\bi(?:'m| am)\s+(?:an?|the)\s+.+\b(?:at|leading|working on|focused on|owning)\b/i,
  unresolved:
    /\b(open loop|blocked|pending|remaining|follow up|follow-up|todo|next step)\b/i,
  validated: /\b(worked well|keep using|effective|successful)\b/i,
} as const;

export function analyzeEnglishQuery(query: string): LanguageQueryAnalysis {
  const role = QUERY.role.test(query) &&
    !/\b(?:application|deadline|submitting|submission)\b/iu.test(query) &&
    !/\b(?:age\s+and\s+role\s+of|role\s+of\s+the\s+mentor)\b/iu.test(query) &&
    !/\brole\s+did\b[\s\S]{0,120}\bplay\b/iu.test(query);
  const openLoop = QUERY.openLoop.test(query) && !(
    /\b(?:what\s+(?:do|should|can)\s+i\s+do|how\s+(?:do|can|should)\s+i|how\s+should\s+i|what\s+steps\s+should\s+i)\b/iu.test(query) &&
    /\b(?:need to|have to|verification|verify)\b/iu.test(query) &&
    !/\b(?:open loop|handoff|signoff|todo|to-do)\b/iu.test(query)
  );
  const referenceSeeking = QUERY.reference.test(query) &&
    !/\bguide\s+my\s+essay\s+writing\b/iu.test(query);
  const userGroundedEventOrder =
    (
      /\b(?:what\s+is\s+the\s+order|order\s+(?:of|in\s+which)|in\s+which\s+order|chronological(?:ly)?|earliest[\s\S]{0,80}latest|first[\s\S]{0,80}last)\b/iu.test(
        query,
      )
    ) &&
    (
      /\bI\b[\s\S]{0,80}\b(?:brought\s+up|discussed|mentioned|talked\s+about)\b/iu.test(
        query,
      ) ||
      /\b(?:brought\s+up|discussed|mentioned|talked\s+about)\b[\s\S]{0,80}\b(?:by|from)\s+me\b/iu.test(
        query,
      )
    );
  return {
    actionDriving: QUERY.actionDriving.test(query),
    after: QUERY.after.test(query),
    aggregateCount: QUERY.aggregateCount.test(query),
    answerComposition: QUERY.answer.test(query),
    assistantEvidenceRecall: QUERY.assistantEvidenceRecall.test(query),
    before: QUERY.before.test(query),
    blocker: QUERY.blocker.test(query),
    change: QUERY.change.test(query),
    continuation: QUERY.continuation.test(query),
    current: QUERY.current.test(query),
    directFactualLookup: QUERY.directFactualLookup.test(query.trim()),
    exhaustiveList: QUERY.exhaustiveList.test(query),
    factConfirmation: role || QUERY.focus.test(query) || openLoop ||
      QUERY.blocker.test(query) ||
      (QUERY.confirm.test(query) && QUERY.factConfirmationTarget.test(query)),
    focus: QUERY.focus.test(query),
    guidanceSeeking: QUERY.guidanceSeeking.test(query),
    history: QUERY.history.test(query),
    openLoop,
    procedural: QUERY.procedural.test(query),
    projectState: QUERY.projectState.test(query),
    recommendationStyle: QUERY.recommendationStyle.test(query),
    relation: QUERY.relation.test(query),
    referenceSeeking,
    role,
    userGroundedEventOrder,
  };
}

function analyzeEnglishSourceOfTruthDirective(content: string) {
  const negated = (index: number, pointerLength: number): boolean => {
    const prefix = content.slice(Math.max(0, index - 96), index);
    const suffix = content.slice(index + pointerLength, index + pointerLength + 128);
    return (
      /\bnot\s*$/iu.test(prefix) ||
      /\binstead of\s*$/iu.test(prefix) ||
      /\brather than\s*$/iu.test(prefix) ||
      /\b(?:please\s+)?do\s+not\s+(?:use|treat)\s*$/iu.test(prefix) ||
      /\bdon['’]?t\s+(?:use|treat)\s*$/iu.test(prefix) ||
      /\b(?:should|must|will|would)\s+not\s+(?:use|treat)\s*$/iu.test(prefix) ||
      /\b(?:shouldn['’]?t|mustn['’]?t)\s+(?:use|treat)\s*$/iu.test(prefix) ||
      /^\s*(?:is\s+not|,?\s*no\s+longer)\s+the\s+source\s+of\s+truth\b/iu.test(
        suffix,
      ) ||
      /^\s*should\s+not\s+be\s+used\s+as\s+the\s+source\s+of\s+truth\b/iu.test(
        suffix,
      )
    );
  };

  return resolveSourceOfTruthDirective(content, {
    affirmed(index, pointerLength) {
      if (negated(index, pointerLength)) {
        return false;
      }
      const prefix = content.slice(Math.max(0, index - 128), index);
      const suffix = content.slice(
        index + pointerLength,
        index + pointerLength + 160,
      );
      return (
        /\b(?:please\s+)?(?:use|treat)\s*$/iu.test(prefix) &&
          /^\s+as\s+the\s+(?:current\s+)?source\s+of\s+truth\b/iu.test(suffix) ||
        /\bsource\s+of\s+truth(?:\s+for[^\n]{0,120})?\s+(?:is|=)\s*$/iu.test(
          prefix,
        ) ||
        /^\s+is\s+(?:now\s+)?the\s+(?:current\s+)?source\s+of\s+truth\b/iu.test(
          suffix,
        )
      );
    },
    negated,
  });
}

export function analyzeEnglishContent(content: string): LanguageContentAnalysis {
  const factPolarity = CONTENT.negative.test(content)
    ? "negative"
    : CONTENT.positive.test(content)
    ? "positive"
    : "unknown";
  const feedbackKind = CONTENT.validated.test(content)
    ? "validated_pattern"
    : CONTENT.dont.test(content)
    ? "dont"
    : CONTENT.prefer.test(content)
    ? "prefer"
    : "do";
  return {
    assistantAcknowledgement: CONTENT.assistantAck.test(content.trim()),
    assistantContinuity: CONTENT.assistantContinuity.test(content),
    blockerFact: CONTENT.blockerFact.test(content),
    correctionCue: CONTENT.correctionCue.test(content),
    durableCue: CONTENT.durableCue.test(content),
    factPolarity,
    feedbackKind,
    focusFact: CONTENT.focusFact.test(content),
    openLoopFact: CONTENT.openLoopFact.test(content),
    personalEvidence: CONTENT.personalEvidence.test(content),
    preferenceEvidence: CONTENT.preferenceEvidence.test(content),
    projectStateFact: CONTENT.projectStateFact.test(content),
    roleFact: CONTENT.roleFact.test(content),
    sourceOfTruthDirective: analyzeEnglishSourceOfTruthDirective(content),
    unresolved: CONTENT.unresolved.test(content),
  };
}

export function decomposeEnglishQuery(query: string): string[] {
  const question = /^(?:what|which|who|where|when|why|how|do|does|did|is|are|was|were|has|have|had|can|could|should|would|will)\b/iu.test(
    query.trim(),
  );
  return decomposeQueryByPattern(
    query,
    question
      ? /\s+(?:and|&|as well as|along with)\s+(?=(?:what|which|who|where|when|why|how|do|does|did|is|are|was|were|has|have|had|can|could|should|would|will)\b)/iu
      : /\s+(?:and|&|as well as|along with)\s+/iu,
  );
}

export function parseEnglishTemporalExpressions(
  text: string,
): LanguageTemporalExpression[] {
  return [
    ...parseTechnicalTemporalExpressions(text),
    ...parsePatternTemporalExpressions(text, [
      {
        kind: "absolute",
        pattern: /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[-/ ]\d{1,2}[-/ ]\d{2,4}\b/giu,
        unit: "day",
      },
      {
        kind: "relative",
        pattern: /\b(?:today|yesterday|tomorrow)\b/giu,
        unit: "day",
      },
      {
        kind: "relative",
        pattern: /\b(?:last|next|this)\s+(?:week|month|quarter|year)\b/giu,
      },
    ]),
  ];
}

export function extractEnglishEntityMentions(
  text: string,
): LanguageEntityMention[] {
  const stopwords = new Set([
    "a",
    "an",
    "how",
    "i",
    "the",
    "what",
    "when",
    "where",
    "which",
    "who",
    "why",
  ]);
  return extractPatternMentions(text, [
    {
      kind: "term",
      pattern: /\b([A-Z][A-Za-z0-9&.'_-]*(?:\s+[A-Z][A-Za-z0-9&.'_-]*){0,4})\b/gu,
    },
    {
      kind: "identifier",
      pattern: /\b([A-Za-z]+[-_]\d+|[A-Z]{2,}\d*)\b/gu,
    },
  ]).filter((mention) => !stopwords.has(mention.normalized));
}

function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function acceptsEnglishEntityCandidate(
  input: LanguageEntityCandidateInput,
): boolean {
  const surfaces = input.aliases.length > 0
    ? input.aliases
    : [input.canonicalKey];
  const titleCaseSurfaces = surfaces.filter((surface) => {
    const trimmed = surface.trim();
    return trimmed.length >= 2 &&
      !/\s/u.test(trimmed) &&
      /^\p{Lu}[\p{Ll}\p{N}]+$/u.test(trimmed);
  });
  if (
    titleCaseSurfaces.length === 0 ||
    titleCaseSurfaces.length !== surfaces.length
  ) {
    return true;
  }

  const isCorpusCommonWord = titleCaseSurfaces.every((surface) => {
    const lower = surface.trim().normalize("NFKC").toLocaleLowerCase("en-US");
    const pattern = new RegExp(
      `(?:^|[^\\p{L}\\p{N}])${escapeRegExpLiteral(lower)}(?:$|[^\\p{L}\\p{N}])`,
      "u",
    );
    return input.documentTexts.some((text) => pattern.test(text));
  });
  return !isCorpusCommonWord;
}

const ENGLISH_RENDER_CATALOG = {
  active_context: "Active Context",
  actor: "Actor",
  additional_project_state: "Additional project-state context",
  archive: "Session Archive",
  correction: "Correction",
  claim: "Claim",
  current_goal: "Current goal",
  current_projects: "Current projects",
  current_state: "Current state",
  deferred_follow_up: "Deferred follow-up context",
  durable_memory: "Durable Memory",
  episode: "Relevant Episodes",
  episode_item: "Episode",
  evidence: "Evidence",
  evidence_entry: "Evidence {evidenceId} from memory {memoryId}.",
  evidence_note: "Read entries using their temporal status and evidence relation.",
  excerpt: "Excerpt",
  fact: "Facts",
  fact_item: "Fact",
  feedback: "Feedback",
  file_evidence: "File evidence",
  goals: "Goals",
  immediate_next_steps: "Immediate next-step support",
  journal: "Session Journal",
  key_decisions: "Key decisions",
  open_loops: "Open loops",
  preference: "Preferences",
  procedural_memory: "Procedural Memory",
  profile: "Profile",
  recent_worklog: "Recent worklog",
  reference: "References",
  reference_item: "Reference",
  relation_label: "Relation",
  session_archive_item: "Session archive",
  tool_result: "Tool result",
  temporal_status: "Temporal status",
  verification: "Verification",
  working_memory: "Working Memory",
} as const;

export function renderEnglish(input: LanguageRenderInput): string {
  return renderFromCatalog(input, ENGLISH_RENDER_CATALOG);
}
