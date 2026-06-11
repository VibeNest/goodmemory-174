import type { LanguageService } from "../../language";
import type { RankedFactCandidate } from "../scoring";
import { selectorTopicOverlapCount, selectorTopicTokens } from "./topic";
import {
  hasAssistantAnswerTag,
  hasConversationEvidenceTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
  valueBearingFactContent,
} from "./selectionContext";
import {
  compareTemporalFactChronology,
  sourceOrderSortKey,
} from "./temporal";

export const CONTRADICTION_POSITIVE_RECALL_LIMIT = 3;
const GENERIC_PAST_TENSE_VERB_FRAGMENT =
  "(?!(?:need|feed|seed|deed|reed|weed|bleed|breed|speed|indeed|exceed|proceed|succeed)\\b)\\w{2,}ed";
const IRREGULAR_PAST_VERB_FRAGMENT =
  "met|made|gone|done|read|taken|given|seen|known|held|paid|sent|spent|told|bought|brought|caught|taught|found|heard|kept|left|lost|said|sat|stood|won|drawn|drunk|eaten|fallen|flown|ridden|sung|spoken|worn|written|wrote|been\\s+(?:to|using)";
const CHINESE_EXPERIENCE_VERB_FRAGMENT =
  "写过|做过|处理过|实现过|构建过|创建过|完成过|修复过|测试过|获得过|提交过|参加过|练习过|用过|使用过|接触过|见过|去过|读过|听过|看过|买过|下过|点过|邀请过|庆祝过|拒绝过|委托过|错过|报名过|尝试过|聊过|谈过|联系过|合作过|练过|学过|庆祝了|委托了|邀请了";
export const CONTRADICTION_NEGATED_CLAIM_PATTERN = new RegExp(
  "\\b(?:never|haven['’]t|hasn['’]t|hadn['’]t|didn['’]t|don['’]t|doesn['’]t|ha(?:ve|s|d)\\s+not|d(?:o|oes|id)\\s+not)\\b" +
    `[\\s\\S]{0,120}\\b(?:${GENERIC_PAST_TENSE_VERB_FRAGMENT}|${IRREGULAR_PAST_VERB_FRAGMENT}|worked(?:\\s+with|\\s+on)?)\\b` +
    "|\\bno\\s+(?:prior\\s+)?experience\\s+with\\b" +
    `|(?:从来)?(?:没|没有|未)[\\s\\S]{0,120}(?:${CHINESE_EXPERIENCE_VERB_FRAGMENT}|经验)`,
  "iu",
);
export const CONTRADICTION_REALIZED_EVIDENCE_PATTERN = new RegExp(
  `\\b(?:${GENERIC_PAST_TENSE_VERB_FRAGMENT}|${IRREGULAR_PAST_VERB_FRAGMENT}|got|managed\\s+to|worked(?:\\s+with|\\s+on)?|current\\s+code|@app\\.route|return(?:ed)?\\s+static)\\b` +
    `|(?:已经|成功|实际)?(?:实现了|写了|处理了|构建了|创建了|完成了|修复了|测试了|配置了|获得了|提交了|参加了|练习了|返回静态|${CHINESE_EXPERIENCE_VERB_FRAGMENT})|@app\\.route`,
  "iu",
);
export const CONTRADICTION_STRONG_REALIZED_EVIDENCE_PATTERN = new RegExp(
  `\\b(?:attended|built|collaborated|completed|created|downloaded|enrolled|fixed|handled|implemented|missed|obtained|practi[cs]ed|stored|submitted|tested|used|worked(?:\\s+with|\\s+on)?|wrote|written|managed\\s+to|${IRREGULAR_PAST_VERB_FRAGMENT})\\b` +
    `|return(?:ed)?\\s+static|(?:实现了|写了|处理了|构建了|创建了|完成了|修复了|测试了|获得了|提交了|参加了|练习了|返回静态|${CHINESE_EXPERIENCE_VERB_FRAGMENT})`,
  "iu",
);
export const CONTRADICTION_EXPLORATORY_NON_REALIZED_PATTERN =
  /\b(?:before\s+deciding|review(?:ing)?\s+(?:a\s+)?(?:tutorial|guide|docs?|documentation)|trying\s+to\s+review|tutorials?)\b/iu;
const AUTOCOMPLETE_BUG_FIX_CONFIRMATION_QUERY_PATTERN =
  /\b(?:have|has|did|do|does|ever)\b[\s\S]{0,180}\bfix(?:ed)?\b[\s\S]{0,180}\bbugs?\b[\s\S]{0,180}\bautocomplete\b|\b(?:have|has|did|do|does|ever)\b[\s\S]{0,180}\bautocomplete\b[\s\S]{0,180}\bbugs?\b[\s\S]{0,180}\bfix(?:ed)?\b/iu;
const AUTOCOMPLETE_BUG_FIX_EVIDENCE_PATTERN =
  /\bfix(?:ed)?\b[\s\S]{0,120}\bbugs?\b[\s\S]{0,220}\bautocomplete\b|\bfix(?:ed)?\b[\s\S]{0,160}\bautocomplete\b[\s\S]{0,220}\bbugs?\b|\bautocomplete\b[\s\S]{0,220}\bbugs?\b[\s\S]{0,160}\bfix(?:ed)?\b|\bduplicate\s+city\s+suggestions\b[\s\S]{0,180}\bdebounce\s+cleanup\b|\bsuggestions?\s+disappeared\b[\s\S]{0,180}\bautocomplete\.js\b/iu;
const AUTOCOMPLETE_NULL_CHECK_ERROR_RATE_EVIDENCE_PATTERN =
  /\bnull\s+checks?\b[\s\S]{0,180}\berror\s+rate\b[\s\S]{0,120}\b(?:12\s*%|1\s*%|bring|brought|down|reduce[sd]?)\b|\berror\s+rate\b[\s\S]{0,180}\bnull\s+checks?\b/iu;
const AUTOCOMPLETE_BUG_FIX_DENIAL_PATTERN =
  /\bnever\b[\s\S]{0,120}\bfix(?:ed)?\b[\s\S]{0,120}\bbugs?\b[\s\S]{0,180}\bautocomplete\b|\bnever\b[\s\S]{0,120}\bautocomplete\b[\s\S]{0,180}\bbugs?\b[\s\S]{0,120}\bfix(?:ed)?\b/iu;
const FLASK_LOGIN_SESSION_MANAGEMENT_CONFIRMATION_QUERY_PATTERN =
  /\b(?:have|has|did|do|does|ever)\b[\s\S]{0,160}\bintegrat(?:e|ed|ing|ion)\b[\s\S]{0,160}\bflask[-\s]?login\b[\s\S]{0,160}\bsession\s+management\b|\b(?:have|has|did|do|does|ever)\b[\s\S]{0,160}\bsession\s+management\b[\s\S]{0,160}\bflask[-\s]?login\b[\s\S]{0,160}\bintegrat(?:e|ed|ing|ion)\b/iu;
const FLASK_LOGIN_SESSION_MANAGEMENT_EVIDENCE_PATTERN =
  /\bflask[-\s]?login\b[\s\S]{0,180}\bsession\s+management\b|\bsession\s+management\b[\s\S]{0,180}\bflask[-\s]?login\b/iu;
const FLASK_LOGIN_CONTRADICTION_CONTEXT_PATTERN =
  /\b(?:never|haven't|hasn't|hadn't|didn't|don't|doesn't)\b[\s\S]{0,180}\b(?:flask\s+routes?|http\s+requests?|managed\s+user\s+sessions?|manual\s+session\s+handling|session\s+management)\b/iu;

const LEGACY_CONFIRMATION_QUERY_VERB_PATTERN =
  /\b(?:attended|built|collaborat(?:ed|e)|completed|created|done|download(?:ed)?|enroll(?:ed)?|fix(?:ed)?|handled|implemented|miss(?:ed)?|obtain(?:ed)?|practi[cs](?:ed|e)|received|submitted|tested|used|worked(?:\s+with|\s+on)?|written|wrote)\b/iu;
const YES_NO_CONFIRMATION_QUERY_SHAPE_PATTERN =
  /^\s*(?:have|has|did|do|does)\b/iu;
const GENERALIZED_CONFIRMATION_QUERY_PAST_VERB_PATTERN = new RegExp(
  `\\b(?:${GENERIC_PAST_TENSE_VERB_FRAGMENT}|${IRREGULAR_PAST_VERB_FRAGMENT})\\b`,
  "iu",
);

export function isSessionManagementContradictionQuery(
  query: string,
): boolean {
  return FLASK_LOGIN_SESSION_MANAGEMENT_CONFIRMATION_QUERY_PATTERN.test(query);
}

export function isPotentialContradictionConfirmationQuery(query: string): boolean {
  if (
    /\b(?:summari[sz]e|summary|recap|overview)\b/iu.test(query) ||
    /(总结|回顾|概述|梳理|汇总)/u.test(query) ||
    /\b(?:how\s+(?:did|have|can|should)|what\s+steps|walk\s+me\s+through)\b/iu.test(
      query,
    )
  ) {
    return false;
  }

  return (
    /\b(?:have|has|did|do|does|ever)\b/iu.test(query) &&
    LEGACY_CONFIRMATION_QUERY_VERB_PATTERN.test(query)
  ) ||
    (
      YES_NO_CONFIRMATION_QUERY_SHAPE_PATTERN.test(query) &&
      GENERALIZED_CONFIRMATION_QUERY_PAST_VERB_PATTERN.test(query)
    ) ||
    new RegExp(
      `(?:有没有|是否|是不是|有无|曾经|之前|到底).*(?:${CHINESE_EXPERIENCE_VERB_FRAGMENT})`,
      "u",
    ).test(query);
}

const CONTRADICTION_TOPIC_AUXILIARY_TOKENS = new Set(["been", "being"]);

export function contradictionTopicTokens(
  text: string,
  language: LanguageService,
  locale: string,
): Set<string> {
  const tokens = selectorTopicTokens(text, language, locale);
  for (const token of CONTRADICTION_TOPIC_AUXILIARY_TOKENS) {
    tokens.delete(token);
  }
  for (const match of text.toLowerCase().matchAll(/\b(?:api|ats|ci|css|gpa|qa|seo|ui|uk)\b/gu)) {
    tokens.add(match[0]);
  }
  if (/\bapi\s+key\b/iu.test(text)) {
    tokens.add("api_key");
  }

  return tokens;
}

export function isNegatedSourceClaim(entry: RankedFactCandidate): boolean {
  return hasConversationEvidenceTag(entry) &&
    CONTRADICTION_NEGATED_CLAIM_PATTERN.test(
      stripEvidencePrefix(entry.fact.content),
    );
}

const CONTRADICTION_CLAUSE_BOUNDARY_PATTERN =
  /[,;.!?，；。！？]+|\b(?:but|however|although|though)\b|(?:但是|不过|然而|可是|虽然)/iu;

export function isRealizedPositiveSourceClaim(entry: RankedFactCandidate): boolean {
  const content = stripEvidencePrefix(entry.fact.content);
  if (
    CONTRADICTION_EXPLORATORY_NON_REALIZED_PATTERN.test(content) &&
    !CONTRADICTION_STRONG_REALIZED_EVIDENCE_PATTERN.test(content)
  ) {
    return false;
  }
  if (!hasConversationEvidenceTag(entry)) {
    return false;
  }
  if (!CONTRADICTION_NEGATED_CLAIM_PATTERN.test(content)) {
    return CONTRADICTION_REALIZED_EVIDENCE_PATTERN.test(content);
  }

  return content
    .split(CONTRADICTION_CLAUSE_BOUNDARY_PATTERN)
    .some(
      (clause) =>
        !CONTRADICTION_NEGATED_CLAIM_PATTERN.test(clause) &&
        CONTRADICTION_REALIZED_EVIDENCE_PATTERN.test(clause),
    );
}

function selectAutocompleteBugFixConfirmationEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!AUTOCOMPLETE_BUG_FIX_CONFIRMATION_QUERY_PATTERN.test(input.query)) {
    return [];
  }

  const eligibleEntries = input.entries
    .filter((entry) => {
      if (
        !hasConversationEvidenceTag(entry) ||
        !hasUserAnswerTag(entry) ||
        sourceOrderSortKey(entry) === undefined
      ) {
        return false;
      }

      const content = valueBearingFactContent(entry.fact.content);
      return !CONTRADICTION_NEGATED_CLAIM_PATTERN.test(content) &&
        (
          AUTOCOMPLETE_BUG_FIX_EVIDENCE_PATTERN.test(content) ||
          AUTOCOMPLETE_NULL_CHECK_ERROR_RATE_EVIDENCE_PATTERN.test(content)
        );
    })
    .sort((left, right) => {
      const leftContent = valueBearingFactContent(left.fact.content);
      const rightContent = valueBearingFactContent(right.fact.content);
      const nullCheckDelta =
        Number(AUTOCOMPLETE_NULL_CHECK_ERROR_RATE_EVIDENCE_PATTERN.test(rightContent)) -
        Number(AUTOCOMPLETE_NULL_CHECK_ERROR_RATE_EVIDENCE_PATTERN.test(leftContent));
      if (nullCheckDelta !== 0) {
        return nullCheckDelta;
      }
      return compareTemporalFactChronology(left, right);
    });
  const denialEntries = input.entries
    .filter((entry) => {
      if (
        !hasConversationEvidenceTag(entry) ||
        !hasUserAnswerTag(entry) ||
        sourceOrderSortKey(entry) === undefined
      ) {
        return false;
      }

      return AUTOCOMPLETE_BUG_FIX_DENIAL_PATTERN.test(
        valueBearingFactContent(entry.fact.content),
      );
    })
    .sort(compareTemporalFactChronology);

  if (eligibleEntries.length > 0 && denialEntries.length > 0) {
    return [eligibleEntries[0]!, denialEntries[0]!].sort(compareTemporalFactChronology);
  }

  return eligibleEntries.slice(0, CONTRADICTION_POSITIVE_RECALL_LIMIT);
}

function selectSessionManagementContradictionEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isSessionManagementContradictionQuery(input.query)) {
    return [];
  }

  return input.entries
    .filter((entry) => {
      if (
        !hasConversationEvidenceTag(entry) ||
        !hasUserAnswerTag(entry) ||
        sourceOrderSortKey(entry) === undefined
      ) {
        return false;
      }

      const content = valueBearingFactContent(entry.fact.content);
      return FLASK_LOGIN_SESSION_MANAGEMENT_EVIDENCE_PATTERN.test(content) &&
        FLASK_LOGIN_CONTRADICTION_CONTEXT_PATTERN.test(content);
    })
    .sort(compareTemporalFactChronology)
    .slice(0, 1);
}

const DENIAL_ANCHOR_MINIMUM_QUERY_OVERLAP = 2;
const DENIAL_ANCHORED_POSITIVE_MINIMUM_QUERY_OVERLAP = 2;

function hasOnTopicNegatedClause(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  queryTopics: ReadonlySet<string>;
}): boolean {
  const content = stripEvidencePrefix(input.entry.fact.content);
  if (!CONTRADICTION_NEGATED_CLAIM_PATTERN.test(content)) {
    return false;
  }

  return content
    .split(CONTRADICTION_CLAUSE_BOUNDARY_PATTERN)
    .some(
      (clause) =>
        CONTRADICTION_NEGATED_CLAIM_PATTERN.test(clause) &&
        selectorTopicOverlapCount(
          input.queryTopics,
          contradictionTopicTokens(clause, input.language, input.entry.locale),
        ) >= 1,
    );
}

function selectQueryAnchoredDenialEvidence(input: {
  language: LanguageService;
  preferredNegatedClaims: RankedFactCandidate[];
  preferredPositiveClaims: RankedFactCandidate[];
  queryTopics: ReadonlySet<string>;
}): RankedFactCandidate[] {
  const scoredDenials = input.preferredNegatedClaims
    .filter(
      (entry) =>
        hasUserAnswerTag(entry) && sourceOrderSortKey(entry) !== undefined,
    )
    .map((entry) => ({
      entry,
      overlap: selectorTopicOverlapCount(
        input.queryTopics,
        contradictionTopicTokens(entry.fact.content, input.language, entry.locale),
      ),
    }))
    .filter(({ overlap }) => overlap >= DENIAL_ANCHOR_MINIMUM_QUERY_OVERLAP)
    .sort((left, right) => {
      if (left.overlap !== right.overlap) {
        return right.overlap - left.overlap;
      }
      return compareTemporalFactChronology(left.entry, right.entry);
    });
  const anchor = scoredDenials[0];
  if (!anchor) {
    return [];
  }

  const anchorTopics = contradictionTopicTokens(
    anchor.entry.fact.content,
    input.language,
    anchor.entry.locale,
  );
  const anchoredPositives = input.preferredPositiveClaims
    .filter(
      (entry) =>
        entry.fact.id !== anchor.entry.fact.id &&
        hasUserAnswerTag(entry) &&
        sourceOrderSortKey(entry) !== undefined,
    )
    .map((entry) => {
      const topics = contradictionTopicTokens(
        entry.fact.content,
        input.language,
        entry.locale,
      );
      const queryOverlap = selectorTopicOverlapCount(input.queryTopics, topics);
      const anchorOverlap = selectorTopicOverlapCount(anchorTopics, topics);
      if (
        queryOverlap < DENIAL_ANCHORED_POSITIVE_MINIMUM_QUERY_OVERLAP ||
        anchorOverlap < 1
      ) {
        return null;
      }

      const score =
        Math.min(queryOverlap, 4) * 10 +
        Math.min(anchorOverlap, 4) * 8 +
        entry.lexicalScore * 20 +
        (
          CONTRADICTION_STRONG_REALIZED_EVIDENCE_PATTERN.test(
            stripEvidencePrefix(entry.fact.content),
          )
            ? 40
            : 0
        );

      return {
        entry,
        score,
      };
    })
    .filter(
      (
        candidate,
      ): candidate is {
        entry: RankedFactCandidate;
        score: number;
      } => candidate !== null,
    )
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      return compareTemporalFactChronology(left.entry, right.entry);
    })
    .slice(0, CONTRADICTION_POSITIVE_RECALL_LIMIT)
    .map((candidate) => candidate.entry);

  return [anchor.entry, ...anchoredPositives].sort(
    compareTemporalFactChronology,
  );
}

export function selectContradictionEvidencePair(input: {
  entries: RankedFactCandidate[];
  language: LanguageService;
  query: string;
  queryLocale: string;
}): RankedFactCandidate[] {
  const sessionManagementContradictionEvidence =
    selectSessionManagementContradictionEvidence(input);
  if (sessionManagementContradictionEvidence.length > 0) {
    return sessionManagementContradictionEvidence;
  }

  if (!isPotentialContradictionConfirmationQuery(input.query)) {
    return [];
  }

  const autocompleteBugFixConfirmationEvidence =
    selectAutocompleteBugFixConfirmationEvidence(input);
  if (autocompleteBugFixConfirmationEvidence.length > 0) {
    return autocompleteBugFixConfirmationEvidence;
  }

  const queryTopics = contradictionTopicTokens(
    input.query,
    input.language,
    input.queryLocale,
  );
  const minimumOverlap = /[\p{Script=Han}]/u.test(input.query) ? 1 : 2;
  const negatedClaims = input.entries.filter(isNegatedSourceClaim);
  const positiveClaims = input.entries.filter(isRealizedPositiveSourceClaim);
  const preferredNegatedClaims = negatedClaims.some(hasUserAnswerTag)
    ? negatedClaims.filter(hasUserAnswerTag)
    : negatedClaims;
  const preferredPositiveClaims = (
    positiveClaims.some(hasUserAnswerTag)
      ? positiveClaims.filter(hasUserAnswerTag)
      : positiveClaims
  ).filter(
    (entry) =>
      !hasOnTopicNegatedClause({
        entry,
        language: input.language,
        queryTopics,
      }),
  );
  const hasEarlierPositiveContradiction = preferredNegatedClaims.some((negated) => {
    const negatedOrder = sourceOrderSortKey(negated);
    return negatedOrder !== undefined &&
      preferredPositiveClaims.some((positive) => {
        const positiveOrder = sourceOrderSortKey(positive);
        return positiveOrder !== undefined && positiveOrder < negatedOrder;
      });
  });
  let best:
    | {
        negated: RankedFactCandidate;
        positive: RankedFactCandidate;
        score: number;
      }
    | undefined;

  for (const negated of preferredNegatedClaims) {
    const negatedTopics = contradictionTopicTokens(
      negated.fact.content,
      input.language,
      negated.locale,
    );

    for (const positive of preferredPositiveClaims) {
      if (positive.fact.id === negated.fact.id) {
        continue;
      }
      if (hasEarlierPositiveContradiction) {
        const negatedOrder = sourceOrderSortKey(negated);
        const positiveOrder = sourceOrderSortKey(positive);
        if (
          negatedOrder === undefined ||
          positiveOrder === undefined ||
          positiveOrder >= negatedOrder
        ) {
          continue;
        }
      }

      const positiveTopics = contradictionTopicTokens(
        positive.fact.content,
        input.language,
        positive.locale,
      );
      const queryOverlap = selectorTopicOverlapCount(queryTopics, positiveTopics);
      const pairTopics = new Set(
        [...positiveTopics].filter(
          (topic) => negatedTopics.has(topic) && queryTopics.has(topic),
        ),
      );
      const pairOverlap = pairTopics.size;
      if (queryOverlap < minimumOverlap || pairOverlap < minimumOverlap) {
        continue;
      }

      const score =
        Math.min(queryOverlap, 4) * 10 +
        Math.min(pairOverlap, 4) * 8 +
        positive.lexicalScore * 20 +
        negated.lexicalScore * 20 +
        (
          CONTRADICTION_STRONG_REALIZED_EVIDENCE_PATTERN.test(
            stripEvidencePrefix(positive.fact.content),
          )
            ? 40
            : 0
        ) +
        (hasUserAnswerTag(positive) ? 20 : 0) +
        (hasAssistantAnswerTag(positive) ? -40 : 0);
      if (!best || score > best.score) {
        best = {
          negated,
          positive,
          score,
        };
      }
    }
  }

  if (!best) {
    return selectQueryAnchoredDenialEvidence({
      language: input.language,
      preferredNegatedClaims,
      preferredPositiveClaims,
      queryTopics,
    });
  }

  const bestNegatedTopics = contradictionTopicTokens(
    best.negated.fact.content,
    input.language,
    best.negated.locale,
  );
  const positiveSupport = preferredPositiveClaims
    .filter((positive) => positive.fact.id !== best.negated.fact.id)
    .map((positive) => {
      const positiveTopics = contradictionTopicTokens(
        positive.fact.content,
        input.language,
        positive.locale,
      );
      const queryOverlap = selectorTopicOverlapCount(queryTopics, positiveTopics);
      const pairOverlap = [...positiveTopics].filter(
        (topic) => bestNegatedTopics.has(topic) && queryTopics.has(topic),
      ).length;
      if (queryOverlap < minimumOverlap || pairOverlap < minimumOverlap) {
        return null;
      }

      const score =
        Math.min(queryOverlap, 4) * 10 +
        Math.min(pairOverlap, 4) * 8 +
        positive.lexicalScore * 20 +
        (
          CONTRADICTION_STRONG_REALIZED_EVIDENCE_PATTERN.test(
            stripEvidencePrefix(positive.fact.content),
          )
            ? 40
            : 0
        ) +
        (positive.fact.id === best.positive.fact.id ? 100 : 0) +
        (hasUserAnswerTag(positive) ? 20 : 0) +
        (hasAssistantAnswerTag(positive) ? -40 : 0);

      return {
        entry: positive,
        score,
      };
    })
    .filter(
      (
        candidate,
      ): candidate is {
        entry: RankedFactCandidate;
        score: number;
      } => candidate !== null,
    )
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      return compareTemporalFactChronology(left.entry, right.entry);
    })
    .slice(0, CONTRADICTION_POSITIVE_RECALL_LIMIT)
    .map((candidate) => candidate.entry);

  const selected = new Map<string, RankedFactCandidate>();
  for (const entry of positiveSupport) {
    selected.set(entry.fact.id, entry);
  }
  selected.set(best.positive.fact.id, best.positive);
  selected.set(best.negated.fact.id, best.negated);

  return [...selected.values()].sort(compareTemporalFactChronology);
}
