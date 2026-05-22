import type { LanguageService } from "../../language";
import type { RankedFactCandidate } from "../scoring";
import { selectorTopicOverlapCount, selectorTopicTokens } from "./topic";
import {
  hasSourceOrderedSummaryCoreFeature,
  hasSourceOrderedSummaryMilestoneAction,
  hasSourceOrderedSummaryMilestoneScope,
  isLowInformationSourceSummaryFollowUp,
  isSourceOrderedSummaryInstructionLike,
} from "./sourceOrderSummarySignals";
import {
  isSourceOrderedSummaryTopicalCompanionCandidate,
  isSourceOrderedSummaryTopicalMilestoneCandidate,
  selectSourceOrderedTopicalSummaryMilestones,
  sourceOrderedSummarySpecificQueryTopics,
  sourceOrderedSummaryTopicalPriority,
} from "./sourceOrderSummaryTopical";
import {
  hasSourceOrderedSummaryCareerPhilosophyMilestone,
  hasSourceOrderedSummaryCreativeProjectMilestone,
  hasSourceOrderedSummaryIssueResolutionMilestone,
  hasSourceOrderedSummaryLearningMilestone,
  hasSourceOrderedSummaryPerformanceGoalMilestone,
  hasSourceOrderedSummaryTechnicalChallengeMilestone,
  hasSourceOrderedSummaryWritingProgressMilestone,
  isSourceOrderedCareerPhilosophySummaryQuery,
  isSourceOrderedConversationSummaryQuery,
  isSourceOrderedCreativeProjectTimelineQuery,
  isSourceOrderedIssueResolutionSummaryQuery,
  isSourceOrderedLearningProgressionQuery,
  isSourceOrderedPerformanceGoalEvolutionQuery,
  isSourceOrderedSummaryCareerPhilosophyUserAnchor,
  isSourceOrderedSummaryCareerPhilosophyUserMilestone,
  isSourceOrderedTechnicalChallengeSummaryQuery,
  isSourceOrderedWritingProgressSummaryQuery,
} from "./sourceOrderSummaryPatterns";
import {
  EXPLICIT_WEAK_LEXICAL_FACT_THRESHOLD,
  hasAssistantAnswerTag,
  hasSourceMessageTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "./selectionContext";
import {
  compareTemporalFactChronology,
  sourceOrderSortKey,
} from "./temporal";
import { contradictionTopicTokens } from "./contradiction";

export const SOURCE_ORDER_SUMMARY_RECALL_LIMIT = 16;
export const SOURCE_ORDER_SUMMARY_ANCHOR_LIMIT = 8;
export const SOURCE_ORDER_SUMMARY_COMPANION_DISTANCE = 1;
export const SOURCE_ORDER_SUMMARY_MILESTONE_MIN_ANCHORS = 4;
const SOURCE_ORDER_SUMMARY_NAMED_ENTITY_MIN_ANCHORS = 2;
const SOURCE_ORDER_SUMMARY_NAMED_ENTITY_STOPWORDS = new Set([
  "ai",
  "beam",
  "can",
  "clear",
  "complete",
  "comprehensive",
  "give",
  "how",
  "i",
  "only",
  "quick",
  "summary",
  "the",
  "what",
  "when",
  "where",
  "why",
]);
const SOURCE_ORDER_SUMMARY_NAMED_ENTITY_DECISION_MILESTONE_PATTERN =
  /\b(?:agree(?:d|ing)?\s+to|commit(?:ted|ting)?\s+to|decid(?:e|ed|ing)\s+(?:to|whether)|declin(?:e|ed|ing)|limit(?:ed|ing)?|negotiat(?:e|ed|ing)|prioriti[sz](?:e|ed|ing)|reduc(?:e|ed|ing)|reschedul(?:e|ed|ing)|resolv(?:e|ed|ing)|schedul(?:e|ed|ing)|set\s+(?:a\s+)?boundar(?:y|ies)|started?|switch(?:ed|ing)|will\s+(?:host|limit|prioriti[sz]e|reduce|reschedule|schedule|support|talk))\b/iu;
const SOURCE_ORDER_SUMMARY_NAMED_ENTITY_DECISION_MILESTONE_ZH_PATTERN =
  /(同意|承诺|决定|拒绝|减少|限制|重新安排|安排|协商|优先|解决|设定边界|开始|切换)/u;

export function isSourceOrderedSummaryCandidate(entry: RankedFactCandidate): boolean {
  return hasSourceMessageTag(entry) && sourceOrderSortKey(entry) !== undefined;
}

function hasSourceOrderedSummarySourceEnvelope(entry: RankedFactCandidate): boolean {
  const content = entry.fact.content;
  return /\b(?:chat[_-]?id|source[_-]?order|sourceOrder)\s*[:=]\s*\d+\b/iu.test(
    content,
  ) || /\brole\s*=\s*(?:assistant|user)\b/iu.test(content);
}

function sourceOrderedSummaryNamedEntityTokens(value: string): Set<string> {
  const tokens = new Set<string>();
  for (const match of value.matchAll(/\b[A-Z][A-Za-z0-9]*(?:[-.][A-Za-z0-9]+)*\b/gu)) {
    const token = match[0].toLowerCase();
    if (
      token.length > 2 &&
      !SOURCE_ORDER_SUMMARY_NAMED_ENTITY_STOPWORDS.has(token)
    ) {
      tokens.add(token);
    }
  }

  return tokens;
}

function sourceOrderedSummaryNamedEntityOverlap(
  value: string,
  queryNamedTokens: ReadonlySet<string>,
): number {
  const contentNamedTokens = sourceOrderedSummaryNamedEntityTokens(value);
  let overlap = 0;
  for (const token of queryNamedTokens) {
    if (contentNamedTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap;
}

function hasSourceOrderedNamedEntitySummaryDecisionMilestone(
  content: string,
): boolean {
  return SOURCE_ORDER_SUMMARY_NAMED_ENTITY_DECISION_MILESTONE_PATTERN.test(
    content,
  ) || SOURCE_ORDER_SUMMARY_NAMED_ENTITY_DECISION_MILESTONE_ZH_PATTERN.test(
    content,
  ) || hasSourceOrderedSummaryMilestoneAction(content);
}

function sourceOrderedSummaryRepresentativeScore(input: {
  entry: RankedFactCandidate;
  priority: (entry: RankedFactCandidate) => number;
}): number {
  const content = stripEvidencePrefix(input.entry.fact.content);
  let score = input.priority(input.entry);
  if (hasSourceOrderedSummarySourceEnvelope(input.entry)) {
    score += 1000;
  }
  score += Math.min(content.length, 2000) / 100;
  return score;
}

function dedupeSourceOrderedSummaryTurns(input: {
  entries: RankedFactCandidate[];
  priority: (entry: RankedFactCandidate) => number;
}): RankedFactCandidate[] {
  const bySourceOrder = new Map<number, RankedFactCandidate>();
  for (const entry of input.entries) {
    const order = sourceOrderSortKey(entry);
    if (order === undefined) {
      continue;
    }

    const current = bySourceOrder.get(order);
    if (!current) {
      bySourceOrder.set(order, entry);
      continue;
    }

    const scoreDelta =
      sourceOrderedSummaryRepresentativeScore({
        entry,
        priority: input.priority,
      }) -
      sourceOrderedSummaryRepresentativeScore({
        entry: current,
        priority: input.priority,
      });
    if (
      scoreDelta > 0 ||
      (
        scoreDelta === 0 &&
        compareTemporalFactChronology(entry, current) < 0
      )
    ) {
      bySourceOrder.set(order, entry);
    }
  }

  return [...bySourceOrder.values()].sort(compareTemporalFactChronology);
}

function sourceOrderedNamedEntitySummaryPriority(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  priority: (entry: RankedFactCandidate) => number;
  queryNamedTokens: ReadonlySet<string>;
  querySpecificTopics: ReadonlySet<string>;
}): number {
  const content = stripEvidencePrefix(input.entry.fact.content);
  const decisionMilestone =
    hasSourceOrderedNamedEntitySummaryDecisionMilestone(content);
  const factTopics = selectorTopicTokens(
    content,
    input.language,
    input.entry.locale,
  );
  let score = input.priority(input.entry) +
    sourceOrderedSummaryNamedEntityOverlap(content, input.queryNamedTokens) * 500 +
    selectorTopicOverlapCount(input.querySpecificTopics, factTopics) * 140;

  if (hasUserAnswerTag(input.entry)) {
    score += 120;
  }
  if (decisionMilestone) {
    score += 540;
  }
  if (isLowInformationSourceSummaryFollowUp(content)) {
    score -= 300;
  }
  if (isSourceOrderedSummaryInstructionLike(content)) {
    score -= 500;
  }

  return score;
}

function selectSourceOrderedNamedEntitySummaryMilestones(input: {
  candidates: RankedFactCandidate[];
  language: LanguageService;
  priority: (entry: RankedFactCandidate) => number;
  queryNamedTokens: ReadonlySet<string>;
  querySpecificTopics: ReadonlySet<string>;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  const sortedCandidates = [...input.candidates].sort(compareTemporalFactChronology);
  const selected = new Map<string, RankedFactCandidate>();
  const addCandidate = (entry: RankedFactCandidate): void => {
    if (selected.size < SOURCE_ORDER_SUMMARY_RECALL_LIMIT) {
      selected.set(entry.fact.id, entry);
    }
  };
  const bucketCount = Math.min(
    SOURCE_ORDER_SUMMARY_ANCHOR_LIMIT,
    sortedCandidates.length,
  );
  const namedPriority = (entry: RankedFactCandidate): number =>
    sourceOrderedNamedEntitySummaryPriority({
      entry,
      language: input.language,
      priority: input.priority,
      queryNamedTokens: input.queryNamedTokens,
      querySpecificTopics: input.querySpecificTopics,
    });

  for (let index = 0; index < bucketCount; index += 1) {
    const start = Math.floor(index * sortedCandidates.length / bucketCount);
    const end = Math.floor((index + 1) * sortedCandidates.length / bucketCount);
    const bucket = sortedCandidates.slice(start, Math.max(start + 1, end));
    const best = [...bucket].sort((left, right) => {
      const priorityDelta = namedPriority(right) - namedPriority(left);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return compareTemporalFactChronology(left, right);
    })[0];
    if (best) {
      addCandidate(best);
    }
  }

  for (const entry of [...sortedCandidates].sort((left, right) => {
    const priorityDelta = namedPriority(right) - namedPriority(left);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return compareTemporalFactChronology(left, right);
  })) {
    if (selected.size >= SOURCE_ORDER_SUMMARY_ANCHOR_LIMIT) {
      break;
    }
    addCandidate(entry);
  }

  for (const anchor of [...selected.values()].sort(compareTemporalFactChronology)) {
    const anchorOrder = sourceOrderSortKey(anchor);
    if (anchorOrder === undefined) {
      continue;
    }

    const companion = input.sourceCandidates
      .filter((entry) => !selected.has(entry.fact.id))
      .filter((entry) => {
        const order = sourceOrderSortKey(entry);
        if (
          order === undefined ||
          !hasAssistantAnswerTag(entry) ||
          order <= anchorOrder ||
          order - anchorOrder > SOURCE_ORDER_SUMMARY_COMPANION_DISTANCE
        ) {
          return false;
        }

        return sourceOrderedSummaryNamedEntityOverlap(
          stripEvidencePrefix(entry.fact.content),
          input.queryNamedTokens,
        ) > 0;
      })
      .sort(compareTemporalFactChronology)[0];
    if (companion) {
      addCandidate(companion);
    }
  }

  return [...selected.values()].sort(compareTemporalFactChronology);
}

export function sourceOrderedSummaryPriority(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  queryTopics: ReadonlySet<string>;
}): number {
  const content = stripEvidencePrefix(input.entry.fact.content);
  const factTopics = selectorTopicTokens(
    content,
    input.language,
    input.entry.locale,
  );
  let priority =
    selectorTopicOverlapCount(input.queryTopics, factTopics) * 120 +
    input.entry.lexicalScore * 100 +
    input.entry.subjectScore * 70 +
    input.entry.intentScore * 50;

  if (hasUserAnswerTag(input.entry) || hasAssistantAnswerTag(input.entry)) {
    priority += 40;
  }
  if (
    /\b(?:challenge|debug(?:ged|ging)?|decision|error|fix(?:ed|ing)?|issue|problem|progress|reflect(?:ed|ion|ions)?|resolv(?:e|ed|ing)|solution)\b/iu.test(
      content,
    )
  ) {
    priority += 35;
  }
  if (/(问题|挑战|错误|报错|修复|解决|推进|进展|决策|调试|实现|处理)/u.test(content)) {
    priority += 35;
  }
  if (
    hasUserAnswerTag(input.entry) &&
    hasSourceOrderedSummaryMilestoneAction(content) &&
    hasSourceOrderedSummaryMilestoneScope(content)
  ) {
    priority += 90;
  }
  if (
    hasUserAnswerTag(input.entry) &&
    hasSourceOrderedSummaryMilestoneAction(content) &&
    hasSourceOrderedSummaryCoreFeature(content)
  ) {
    priority += 45;
  }
  if (isLowInformationSourceSummaryFollowUp(content)) {
    priority -= 180;
  }

  return priority;
}

export function hasSourceOrderedSummarySignal(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  query: string;
  queryLocale: string;
  queryTopics: ReadonlySet<string>;
}): boolean {
  const content = stripEvidencePrefix(input.entry.fact.content);
  const factTopics = selectorTopicTokens(
    content,
    input.language,
    input.entry.locale,
  );
  const topicOverlap = selectorTopicOverlapCount(input.queryTopics, factTopics);

  if (
    input.entry.intentScore > 0 ||
    input.entry.subjectScore > 0 ||
    input.entry.lexicalScore >= EXPLICIT_WEAK_LEXICAL_FACT_THRESHOLD ||
    topicOverlap > 0
  ) {
    return true;
  }

  if (
    isSourceOrderedCreativeProjectTimelineQuery(input.query) &&
    hasSourceOrderedSummaryCreativeProjectMilestone(content)
  ) {
    return true;
  }

  if (
    isSourceOrderedLearningProgressionQuery(input.query) &&
    !isSourceOrderedSummaryInstructionLike(content) &&
    hasSourceOrderedSummaryLearningMilestone(content)
  ) {
    return true;
  }

  if (
    isSourceOrderedWritingProgressSummaryQuery(input.query) &&
    !isSourceOrderedSummaryInstructionLike(content) &&
    hasSourceOrderedSummaryWritingProgressMilestone(content)
  ) {
    return true;
  }

  if (
    isSourceOrderedCareerPhilosophySummaryQuery(input.query) &&
    !isSourceOrderedSummaryInstructionLike(content) &&
    hasSourceOrderedSummaryCareerPhilosophyMilestone(content)
  ) {
    return true;
  }

  if (
    isSourceOrderedTechnicalChallengeSummaryQuery(input.query) &&
    !isSourceOrderedSummaryInstructionLike(content) &&
    hasSourceOrderedSummaryTechnicalChallengeMilestone(content)
  ) {
    return true;
  }

  if (
    /\b(?:issue|problem|challenge|resolved|approached)\b/iu.test(input.query) &&
    /\b(?:debug(?:ged|ging)?|error|fix(?:ed|ing)?|issue|problem|resolv(?:e|ed|ing)|solution)\b/iu.test(
      content,
    )
  ) {
    return true;
  }

  if (
    /(问题|挑战|解决|处理|推进|一步步|怎么|如何)/u.test(input.query) &&
    /(问题|挑战|错误|报错|修复|解决|方案|调试|实现|处理|设计|数据库|schema|部署|上线|加固)/iu.test(content)
  ) {
    return true;
  }

  return false;
}

export function isSourceOrderedSummaryMilestoneCandidate(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  queryTopics: ReadonlySet<string>;
}): boolean {
  if (!hasUserAnswerTag(input.entry)) {
    return false;
  }

  const content = stripEvidencePrefix(input.entry.fact.content);
  if (isLowInformationSourceSummaryFollowUp(content)) {
    return false;
  }

  const factTopics = selectorTopicTokens(
    content,
    input.language,
    input.entry.locale,
  );
  const topicOverlap = selectorTopicOverlapCount(input.queryTopics, factTopics);
  if (
    hasSourceOrderedSummaryMilestoneAction(content) &&
    hasSourceOrderedSummaryCoreFeature(content)
  ) {
    return true;
  }
  if (
    hasSourceOrderedSummaryMilestoneAction(content) &&
    hasSourceOrderedSummaryMilestoneScope(content) &&
    topicOverlap >= 1
  ) {
    return true;
  }
  if (
    topicOverlap === 0 &&
    input.entry.intentScore === 0 &&
    input.entry.subjectScore === 0 &&
    input.entry.lexicalScore < EXPLICIT_WEAK_LEXICAL_FACT_THRESHOLD
  ) {
    return false;
  }

  if (
    hasSourceOrderedSummaryMilestoneAction(content) &&
    (
      hasSourceOrderedSummaryMilestoneScope(content) ||
      topicOverlap >= 2
    )
  ) {
    return true;
  }

  return /(开始|实现|搭建|集成|修复|调试|解决|推进|计划|准备|更新|优化|重构|迁移).*(项目|功能|问题|挑战|表单|画廊|网站|应用|策略|计划|截止)/u.test(
    content,
  );
}

export function isSourceOrderedSummaryCoreMilestoneCandidate(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  queryTopics: ReadonlySet<string>;
}): boolean {
  if (!hasUserAnswerTag(input.entry)) {
    return false;
  }

  const content = stripEvidencePrefix(input.entry.fact.content);
  if (isLowInformationSourceSummaryFollowUp(content)) {
    return false;
  }

  const factTopics = selectorTopicTokens(
    content,
    input.language,
    input.entry.locale,
  );
  const topicOverlap = selectorTopicOverlapCount(input.queryTopics, factTopics);
  if (
    hasSourceOrderedSummaryMilestoneAction(content) &&
    hasSourceOrderedSummaryCoreFeature(content)
  ) {
    return true;
  }
  if (
    topicOverlap === 0 &&
    input.entry.intentScore === 0 &&
    input.entry.subjectScore === 0 &&
    input.entry.lexicalScore < EXPLICIT_WEAK_LEXICAL_FACT_THRESHOLD
  ) {
    return false;
  }

  return (
    hasSourceOrderedSummaryMilestoneAction(content) &&
    hasSourceOrderedSummaryCoreFeature(content)
  ) ||
    /(实现|搭建|集成|修复|调试|解决|推进|计划|准备|更新|优化|部署|完成).*(功能|表单|画廊|图库|布局|后端|前端|数据库|冲刺|阶段|部署|安全)/u.test(
      content,
    );
}

function selectSourceOrderedWritingProgressPairs(input: {
  anchors: RankedFactCandidate[];
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  const selected = new Map<string, RankedFactCandidate>();
  const addCandidate = (entry: RankedFactCandidate): void => {
    if (selected.size < SOURCE_ORDER_SUMMARY_RECALL_LIMIT) {
      selected.set(entry.fact.id, entry);
    }
  };

  for (const anchor of [...input.anchors].sort(compareTemporalFactChronology)) {
    if (selected.size >= SOURCE_ORDER_SUMMARY_RECALL_LIMIT) {
      break;
    }

    addCandidate(anchor);
    const anchorOrder = sourceOrderSortKey(anchor);
    if (anchorOrder === undefined) {
      continue;
    }

    const companion = input.sourceCandidates
      .filter((entry) => !selected.has(entry.fact.id))
      .filter((entry) => {
        const order = sourceOrderSortKey(entry);
        return order !== undefined &&
          hasAssistantAnswerTag(entry) &&
          order > anchorOrder &&
          order - anchorOrder <= SOURCE_ORDER_SUMMARY_COMPANION_DISTANCE;
      })
      .sort(compareTemporalFactChronology)[0];
    if (companion) {
      addCandidate(companion);
    }
  }

  return [...selected.values()].sort(compareTemporalFactChronology);
}

function selectSourceOrderedCareerPhilosophyPairs(input: {
  anchors: RankedFactCandidate[];
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  const selected = new Map<string, RankedFactCandidate>();
  const selectedSourceOrders = new Set<number>();
  const addCandidate = (entry: RankedFactCandidate): void => {
    if (selected.size >= SOURCE_ORDER_SUMMARY_RECALL_LIMIT) {
      return;
    }
    const order = sourceOrderSortKey(entry);
    if (order !== undefined && selectedSourceOrders.has(order)) {
      return;
    }

    selected.set(entry.fact.id, entry);
    if (order !== undefined) {
      selectedSourceOrders.add(order);
    }
  };

  for (const anchor of [...input.anchors].sort(compareTemporalFactChronology)) {
    if (selected.size >= SOURCE_ORDER_SUMMARY_RECALL_LIMIT) {
      break;
    }

    const anchorOrder = sourceOrderSortKey(anchor);
    if (anchorOrder === undefined || !hasUserAnswerTag(anchor)) {
      continue;
    }

    const anchorContent = stripEvidencePrefix(anchor.fact.content);
    if (isSourceOrderedSummaryCareerPhilosophyUserMilestone(anchorContent)) {
      addCandidate(anchor);
    }

    const companion = input.sourceCandidates
      .filter((entry) => {
        const order = sourceOrderSortKey(entry);
        if (
          order === undefined ||
          selectedSourceOrders.has(order) ||
          !hasAssistantAnswerTag(entry) ||
          order <= anchorOrder ||
          order - anchorOrder > SOURCE_ORDER_SUMMARY_COMPANION_DISTANCE
        ) {
          return false;
        }

        return hasSourceOrderedSummaryCareerPhilosophyMilestone(
          stripEvidencePrefix(entry.fact.content),
        );
      })
      .sort(compareTemporalFactChronology)[0];
    if (companion) {
      addCandidate(companion);
    }
  }

  return [...selected.values()].sort(compareTemporalFactChronology);
}

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

function selectSourceOrderedTechnicalChallengeMilestones(input: {
  candidates: RankedFactCandidate[];
  priority: (entry: RankedFactCandidate) => number;
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
    .slice(0, SOURCE_ORDER_SUMMARY_RECALL_LIMIT)
    .sort(compareTemporalFactChronology);
}

export function selectSourceOrderedSummaryCoverage(input: {
  entries: RankedFactCandidate[];
  language: LanguageService;
  query: string;
  queryLocale: string;
}): RankedFactCandidate[] {
  if (!isSourceOrderedConversationSummaryQuery(input.query)) {
    return [];
  }

  const queryTopics = contradictionTopicTokens(
    input.query,
    input.language,
    input.queryLocale,
  );
  const priority = (entry: RankedFactCandidate): number =>
    sourceOrderedSummaryPriority({
      entry,
      language: input.language,
      queryTopics,
    });
  const querySpecificTopics = sourceOrderedSummarySpecificQueryTopics(queryTopics);
  const queryNamedTokens = sourceOrderedSummaryNamedEntityTokens(input.query);
  const topicalPriority = (entry: RankedFactCandidate): number =>
    sourceOrderedSummaryTopicalPriority({
      entry,
      language: input.language,
      priority,
      querySpecificTopics,
    });
  const sourceCandidates = input.entries
    .filter(isSourceOrderedSummaryCandidate)
    .sort(compareTemporalFactChronology);
  const careerPhilosophySummaryQuery =
    isSourceOrderedCareerPhilosophySummaryQuery(input.query);
  const careerPhilosophySourceCandidates = careerPhilosophySummaryQuery
    ? dedupeSourceOrderedSummaryTurns({
      entries: sourceCandidates,
      priority,
    })
    : [];
  const technicalChallengeSummaryQuery =
    isSourceOrderedTechnicalChallengeSummaryQuery(input.query);
  const technicalChallengeSourceCandidates = technicalChallengeSummaryQuery
    ? dedupeSourceOrderedSummaryTurns({
      entries: sourceCandidates,
      priority,
    })
    : [];
  const topicalSourceCandidates = dedupeSourceOrderedSummaryTurns({
    entries: sourceCandidates,
    priority,
  });
  const namedEntitySourceCandidates = queryNamedTokens.size > 0
    ? dedupeSourceOrderedSummaryTurns({
      entries: sourceCandidates.filter((entry) =>
        sourceOrderedSummaryNamedEntityOverlap(
          stripEvidencePrefix(entry.fact.content),
          queryNamedTokens,
        ) > 0
      ),
      priority,
    })
    : [];
  const signaledCandidates = sourceCandidates.filter((entry) =>
    hasSourceOrderedSummarySignal({
      entry,
      language: input.language,
      query: input.query,
      queryLocale: input.queryLocale,
      queryTopics,
    })
  );
  if (signaledCandidates.length === 0) {
    return [];
  }

  const milestoneCandidates = sourceCandidates.filter((entry) =>
    isSourceOrderedSummaryMilestoneCandidate({
      entry,
      language: input.language,
      queryTopics,
    })
  );
  const coreMilestoneCandidates = milestoneCandidates.filter((entry) =>
    isSourceOrderedSummaryCoreMilestoneCandidate({
      entry,
      language: input.language,
      queryTopics,
    })
  );
  const creativeProjectTimelineCandidates =
    isSourceOrderedCreativeProjectTimelineQuery(input.query)
      ? sourceCandidates.filter((entry) =>
        hasSourceOrderedSummaryCreativeProjectMilestone(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      : [];
  const learningProgressionCandidates =
    isSourceOrderedLearningProgressionQuery(input.query)
      ? sourceCandidates.filter((entry) => {
        const content = stripEvidencePrefix(entry.fact.content);
        return !isSourceOrderedSummaryInstructionLike(content) &&
          hasSourceOrderedSummaryLearningMilestone(content);
      })
      : [];
  const performanceGoalEvolutionCandidates =
    isSourceOrderedPerformanceGoalEvolutionQuery(input.query)
      ? sourceCandidates.filter((entry) =>
        hasUserAnswerTag(entry) &&
        hasSourceOrderedSummaryPerformanceGoalMilestone(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      : [];
  const writingProgressCandidates =
    isSourceOrderedWritingProgressSummaryQuery(input.query)
      ? sourceCandidates.filter((entry) => {
        const content = stripEvidencePrefix(entry.fact.content);
        return hasUserAnswerTag(entry) &&
          !isSourceOrderedSummaryInstructionLike(content) &&
          hasSourceOrderedSummaryWritingProgressMilestone(content);
      })
      : [];
  const careerPhilosophyCandidates =
    careerPhilosophySummaryQuery
      ? careerPhilosophySourceCandidates.filter((entry) => {
        const content = stripEvidencePrefix(entry.fact.content);
        if (
          isSourceOrderedSummaryInstructionLike(content) ||
          !hasSourceOrderedSummaryCareerPhilosophyMilestone(content)
        ) {
          return false;
        }

        return hasAssistantAnswerTag(entry) ||
          (
            hasUserAnswerTag(entry) &&
            isSourceOrderedSummaryCareerPhilosophyUserMilestone(content)
          );
      })
      : [];
  const careerPhilosophyUserAnchors =
    careerPhilosophySummaryQuery
      ? careerPhilosophySourceCandidates.filter((entry) =>
        hasUserAnswerTag(entry) &&
        isSourceOrderedSummaryCareerPhilosophyUserAnchor(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      : [];
  const technicalChallengeCandidates =
    technicalChallengeSummaryQuery
      ? technicalChallengeSourceCandidates.filter((entry) => {
        const content = stripEvidencePrefix(entry.fact.content);
        return !isSourceOrderedSummaryInstructionLike(content) &&
          hasSourceOrderedSummaryTechnicalChallengeMilestone(content);
      })
      : [];
  const topicalLearningProgressionSummaryQuery =
    isSourceOrderedLearningProgressionQuery(input.query) &&
    querySpecificTopics.size >= 2;
  const topicalSummaryCandidates = topicalLearningProgressionSummaryQuery
    ? topicalSourceCandidates.filter((entry) =>
      isSourceOrderedSummaryTopicalMilestoneCandidate({
        entry,
        language: input.language,
        querySpecificTopics,
      })
    )
    : [];
  const topicalSummaryCompanions = topicalLearningProgressionSummaryQuery
    ? topicalSourceCandidates.filter((entry) =>
      isSourceOrderedSummaryTopicalCompanionCandidate({
        entry,
        language: input.language,
        querySpecificTopics,
      })
    )
    : [];
  const namedEntitySummaryCandidates = namedEntitySourceCandidates.filter((entry) => {
    const content = stripEvidencePrefix(entry.fact.content);
    return hasUserAnswerTag(entry) &&
      !isSourceOrderedSummaryInstructionLike(content) &&
      !isLowInformationSourceSummaryFollowUp(content);
  });
  const issueResolutionCandidates =
    isSourceOrderedIssueResolutionSummaryQuery(input.query)
      ? sourceCandidates.filter((entry) => {
        const content = stripEvidencePrefix(entry.fact.content);
        return !isSourceOrderedSummaryInstructionLike(content) &&
          hasSourceOrderedSummaryIssueResolutionMilestone(content);
      })
      : [];
  let primaryCandidates = signaledCandidates;
  let preferEarliestPrimaryCandidates = false;
  let skipCompanionSelection = false;
  if (milestoneCandidates.length >= SOURCE_ORDER_SUMMARY_MILESTONE_MIN_ANCHORS) {
    primaryCandidates = milestoneCandidates;
  }
  if (
    coreMilestoneCandidates.length >= SOURCE_ORDER_SUMMARY_MILESTONE_MIN_ANCHORS
  ) {
    primaryCandidates = coreMilestoneCandidates;
  }
  if (
    creativeProjectTimelineCandidates.length >=
      SOURCE_ORDER_SUMMARY_MILESTONE_MIN_ANCHORS
  ) {
    primaryCandidates = creativeProjectTimelineCandidates;
  }
  if (
    learningProgressionCandidates.length >=
      SOURCE_ORDER_SUMMARY_MILESTONE_MIN_ANCHORS
  ) {
    primaryCandidates = learningProgressionCandidates;
    preferEarliestPrimaryCandidates = true;
  }
  if (
    performanceGoalEvolutionCandidates.length >=
      SOURCE_ORDER_SUMMARY_MILESTONE_MIN_ANCHORS
  ) {
    primaryCandidates = performanceGoalEvolutionCandidates;
    preferEarliestPrimaryCandidates = true;
    skipCompanionSelection = true;
  }
  if (
    writingProgressCandidates.length >= SOURCE_ORDER_SUMMARY_MILESTONE_MIN_ANCHORS
  ) {
    return selectSourceOrderedWritingProgressPairs({
      anchors: writingProgressCandidates,
      sourceCandidates,
    });
  }
  if (
    careerPhilosophyCandidates.length >= SOURCE_ORDER_SUMMARY_MILESTONE_MIN_ANCHORS
  ) {
    if (careerPhilosophyUserAnchors.length > 0) {
      return selectSourceOrderedCareerPhilosophyPairs({
        anchors: careerPhilosophyUserAnchors,
        sourceCandidates: careerPhilosophySourceCandidates,
      });
    }

    return careerPhilosophyCandidates.slice(0, SOURCE_ORDER_SUMMARY_RECALL_LIMIT);
  }
  if (
    technicalChallengeCandidates.length >=
      SOURCE_ORDER_SUMMARY_MILESTONE_MIN_ANCHORS
  ) {
    return selectSourceOrderedTechnicalChallengeMilestones({
      candidates: technicalChallengeCandidates,
      priority,
    });
  }
  if (
    namedEntitySummaryCandidates.length >=
      SOURCE_ORDER_SUMMARY_NAMED_ENTITY_MIN_ANCHORS
  ) {
    return selectSourceOrderedNamedEntitySummaryMilestones({
      candidates: namedEntitySummaryCandidates,
      language: input.language,
      priority,
      queryNamedTokens,
      querySpecificTopics,
      sourceCandidates: namedEntitySourceCandidates,
    });
  }
  if (
    topicalSummaryCandidates.length >= SOURCE_ORDER_SUMMARY_MILESTONE_MIN_ANCHORS
  ) {
    return selectSourceOrderedTopicalSummaryMilestones({
      anchorLimit: Math.min(
        SOURCE_ORDER_SUMMARY_ANCHOR_LIMIT,
        Math.ceil(SOURCE_ORDER_SUMMARY_RECALL_LIMIT / 2),
      ),
      anchors: topicalSummaryCandidates,
      companions: topicalSummaryCompanions,
      limit: SOURCE_ORDER_SUMMARY_RECALL_LIMIT,
      milestoneMinAnchors: SOURCE_ORDER_SUMMARY_MILESTONE_MIN_ANCHORS,
      priority: topicalPriority,
    });
  }
  if (
    issueResolutionCandidates.length >= SOURCE_ORDER_SUMMARY_MILESTONE_MIN_ANCHORS
  ) {
    primaryCandidates = issueResolutionCandidates;
    preferEarliestPrimaryCandidates = true;
    skipCompanionSelection = false;
  }
  const selected = new Map<string, RankedFactCandidate>();
  const addCandidate = (entry: RankedFactCandidate): void => {
    if (selected.size < SOURCE_ORDER_SUMMARY_RECALL_LIMIT) {
      selected.set(entry.fact.id, entry);
    }
  };
  const anchorCount = Math.min(
    SOURCE_ORDER_SUMMARY_ANCHOR_LIMIT,
    Math.ceil(SOURCE_ORDER_SUMMARY_RECALL_LIMIT / 2),
    primaryCandidates.length,
  );

  if (preferEarliestPrimaryCandidates) {
    for (const entry of primaryCandidates.slice(
      0,
      SOURCE_ORDER_SUMMARY_RECALL_LIMIT,
    )) {
      addCandidate(entry);
    }
  } else {
    for (let index = 0; index < anchorCount; index += 1) {
      const start = Math.floor(index * primaryCandidates.length / anchorCount);
      const end = Math.floor((index + 1) * primaryCandidates.length / anchorCount);
      const bucket = primaryCandidates.slice(start, Math.max(start + 1, end));
      const best = [...bucket].sort((left, right) => {
        const priorityDelta = priority(right) - priority(left);
        if (priorityDelta !== 0) {
          return priorityDelta;
        }
        return compareTemporalFactChronology(left, right);
      })[0];
      if (best) {
        addCandidate(best);
      }
    }
  }

  if (!preferEarliestPrimaryCandidates) {
    for (const entry of [...primaryCandidates].sort((left, right) => {
      const priorityDelta = priority(right) - priority(left);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return compareTemporalFactChronology(left, right);
    })) {
      if (selected.size >= anchorCount) {
        break;
      }
      addCandidate(entry);
    }
  }

  const anchors = [...selected.values()].sort(compareTemporalFactChronology);
  if (skipCompanionSelection) {
    return anchors;
  }

  for (const anchor of anchors) {
    const anchorOrder = sourceOrderSortKey(anchor);
    if (anchorOrder === undefined) {
      continue;
    }

    const alreadyHasDirectionalCompanion = [...selected.values()].some(
      (entry) => {
        if (entry.fact.id === anchor.fact.id) {
          return false;
        }
        const order = sourceOrderSortKey(entry);
        return order !== undefined &&
          (
            (hasUserAnswerTag(anchor) && hasAssistantAnswerTag(entry) &&
              order > anchorOrder) ||
            (hasAssistantAnswerTag(anchor) && hasUserAnswerTag(entry) &&
              order < anchorOrder)
          );
      },
    );
    if (alreadyHasDirectionalCompanion) {
      continue;
    }

    const companions = sourceCandidates
      .filter((entry) => !selected.has(entry.fact.id))
      .filter((entry) => {
        const order = sourceOrderSortKey(entry);
        return order !== undefined &&
          Math.abs(order - anchorOrder) <= SOURCE_ORDER_SUMMARY_COMPANION_DISTANCE &&
          (
            (hasUserAnswerTag(anchor) && hasAssistantAnswerTag(entry)) ||
            (hasAssistantAnswerTag(anchor) && hasUserAnswerTag(entry))
          );
      })
      .sort((left, right) => {
        const leftOrder = sourceOrderSortKey(left) ?? 0;
        const rightOrder = sourceOrderSortKey(right) ?? 0;
        const leftDirectional =
          (hasUserAnswerTag(anchor) && hasAssistantAnswerTag(left) &&
            leftOrder > anchorOrder) ||
          (hasAssistantAnswerTag(anchor) && hasUserAnswerTag(left) &&
            leftOrder < anchorOrder);
        const rightDirectional =
          (hasUserAnswerTag(anchor) && hasAssistantAnswerTag(right) &&
            rightOrder > anchorOrder) ||
          (hasAssistantAnswerTag(anchor) && hasUserAnswerTag(right) &&
            rightOrder < anchorOrder);
        if (leftDirectional !== rightDirectional) {
          return leftDirectional ? -1 : 1;
        }
        const distanceDelta =
          Math.abs(leftOrder - anchorOrder) - Math.abs(rightOrder - anchorOrder);
        if (distanceDelta !== 0) {
          return distanceDelta;
        }
        return compareTemporalFactChronology(left, right);
      });

    const companion = companions[0];
    if (companion) {
      addCandidate(companion);
    }
  }

  return [...selected.values()].sort(compareTemporalFactChronology);
}
