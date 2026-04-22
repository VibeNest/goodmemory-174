import type {
  EpisodeMemory,
  FactKind,
  FactMemory,
  FeedbackMemory,
  PreferenceMemory,
  ReferenceMemory,
  SessionJournal,
  UserProfile,
  WorkingMemorySnapshot,
} from "../domain/records";
import type { EvidenceRecord } from "../evidence/contracts";
import type { SessionArchive } from "../evolution/contracts";
import { FEEDBACK_RECALL_LIMIT } from "./budgets";
import type { RetrievalProfile, RoutingDecision } from "./router";

export interface MemoryPacket {
  profileSummary?: string;
  activeContextSummary?: string;
  durableMemorySummary?: string;
  preferenceSummary?: string;
  referenceSummary?: string;
  factSummary?: string;
  feedbackSummary?: string;
  episodeSummary?: string;
  archiveSummary?: string;
  evidenceSummary?: string;
  workingMemorySummary?: string;
  journalSummary?: string;
  renderingProfile?: RetrievalProfile;
  debug?: {
    omittedSections: string[];
    estimatedTokens: number;
  };
}

export interface MemoryPacketInput {
  profile: UserProfile | null;
  preferences: PreferenceMemory[];
  references: ReferenceMemory[];
  facts: FactMemory[];
  feedback: FeedbackMemory[];
  episodes: EpisodeMemory[];
  archives: SessionArchive[];
  evidence: EvidenceRecord[];
  workingMemory: WorkingMemorySnapshot | null;
  journal: SessionJournal | null;
  durableCandidateOrder?: string[];
  locale?: string;
  routingDecision?: RoutingDecision;
}

const EVIDENCE_EXCERPT_SUMMARY_LENGTH = 120;

function estimateTokens(value: string): number {
  return Math.ceil(value.length / 4);
}

function summarizeProfile(profile: UserProfile | null): string | undefined {
  if (!profile) {
    return undefined;
  }

  const segments = [
    profile.identity.name,
    profile.identity.role,
    profile.identity.organization,
    profile.identity.location,
    profile.identity.timezone,
    profile.identity.languagePreference,
  ].filter(Boolean);
  return segments.length > 0 ? segments.join(" - ") : undefined;
}

function summarizeActiveContext(profile: UserProfile | null): string | undefined {
  if (!profile) {
    return undefined;
  }

  const segments = [
    profile.activeContext.currentProjects.length > 0
      ? `Current projects: ${profile.activeContext.currentProjects.join(", ")}`
      : undefined,
    profile.activeContext.goals.length > 0
      ? `Goals: ${profile.activeContext.goals.join(", ")}`
      : undefined,
  ].filter(Boolean);

  return segments.length > 0 ? segments.join("\n") : undefined;
}

function inferFactKindForSummary(fact: FactMemory): FactKind | undefined {
  if (fact.factKind) {
    return fact.factKind;
  }

  const content = fact.content;
  const normalized = content.toLowerCase();

  if (
    /\bblocker\b|\bblocked\b|\bblocking\b|\bapproval\b/i.test(content) ||
    /阻塞|卡点|卡住|审批/u.test(content)
  ) {
    return "blocker";
  }
  if (
    /\bopen loop\b|\bhandoff\b|\bsignoff\b|\bverification\b/i.test(content) ||
    /待跟进|待处理|签字|验收/u.test(content)
  ) {
    return "open_loop";
  }
  if (
    /\bcurrent focus\b/i.test(content) ||
    /当前重点|当前聚焦/u.test(content)
  ) {
    return "focus_update";
  }
  if (
    /\bnext milestone\b|\bnext step\b|\bnext action\b|\bpending\b|\bremaining\b|\bneeds? review\b|\bneeds? confirmation\b|\bfollow(?:-| )?up\b/i.test(
      normalized,
    ) ||
    /下一步|待确认|待评审|后续跟进/u.test(content)
  ) {
    return "project_state";
  }

  return undefined;
}

function shouldGroupProjectStateSupport(routingDecision?: RoutingDecision): boolean {
  if (!routingDecision) {
    return false;
  }

  return (
    routingDecision.supportSlots.includes("project_state_support") &&
    !routingDecision.requestedSlots.includes("blocker") &&
    !routingDecision.requestedSlots.includes("open_loop")
  );
}

function factsSectionLabels(locale?: string): {
  immediate: string;
  deferred: string;
  additional: string;
} {
  const normalizedLocale = locale?.toLowerCase() ?? "en-us";

  if (normalizedLocale.startsWith("zh")) {
    return {
      immediate: "当前可立即推进的下一步:",
      deferred: "后续待跟进事项:",
      additional: "补充项目状态上下文:",
    };
  }

  return {
    immediate: "Immediate next-step support:",
    deferred: "Deferred follow-up context:",
    additional: "Additional project-state context:",
  };
}

function summarizeFacts(
  facts: FactMemory[],
  locale?: string,
  routingDecision?: RoutingDecision,
): string | undefined {
  const activeFacts = facts.filter((fact) => fact.lifecycle === "active").slice(0, 3);
  if (activeFacts.length === 0) {
    return undefined;
  }

  if (!shouldGroupProjectStateSupport(routingDecision)) {
    return activeFacts.map((fact) => `- ${fact.content}`).join("\n");
  }

  const immediate: string[] = [];
  const deferred: string[] = [];
  const additional: string[] = [];
  const labels = factsSectionLabels(locale);

  for (const fact of activeFacts) {
    const factKind = inferFactKindForSummary(fact);

    if (factKind === "blocker" || factKind === "project_state") {
      immediate.push(`- ${fact.content}`);
      continue;
    }
    if (factKind === "open_loop") {
      deferred.push(`- ${fact.content}`);
      continue;
    }

    additional.push(`- ${fact.content}`);
  }

  const segments: string[] = [];
  if (immediate.length > 0) {
    segments.push(labels.immediate, ...immediate);
  }
  if (deferred.length > 0) {
    segments.push(labels.deferred, ...deferred);
  }
  if (additional.length > 0) {
    segments.push(labels.additional, ...additional);
  }

  if (segments.length === 0) {
    return undefined;
  }

  return segments.join("\n");
}

function summarizePreferences(preferences: PreferenceMemory[]): string | undefined {
  if (preferences.length === 0) {
    return undefined;
  }

  return preferences
    .slice(0, 3)
    .map((preference) => `- ${preference.category}: ${String(preference.value)}`)
    .join("\n");
}

function summarizeReferences(references: ReferenceMemory[]): string | undefined {
  if (references.length === 0) {
    return undefined;
  }

  return references
    .slice(0, 3)
    .map((reference) => `- ${reference.title} (${reference.pointer})`)
    .join("\n");
}

function summarizeFeedback(feedback: FeedbackMemory[]): string | undefined {
  const activeFeedback = feedback
    .filter((item) => item.lifecycle === "active")
    .slice(0, FEEDBACK_RECALL_LIMIT);
  if (activeFeedback.length === 0) {
    return undefined;
  }
  const seenRules = new Set<string>();
  const rendered: string[] = [];

  for (const item of activeFeedback) {
    const normalizedRule = item.rule.trim().toLowerCase();
    if (seenRules.has(normalizedRule)) {
      continue;
    }

    seenRules.add(normalizedRule);
    rendered.push(`- ${item.rule}`);
  }

  return rendered.join("\n");
}

function clipSummaryText(content: string, maxLength: number): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 3)}...`;
}

function summarizeEvidenceRecord(record: EvidenceRecord): string {
  const excerpt = clipSummaryText(record.excerpt, EVIDENCE_EXCERPT_SUMMARY_LENGTH);

  if (record.kind === "correction_context") {
    return `Correction: ${excerpt}`;
  }
  if (record.kind === "verification_result") {
    return `Verification: ${excerpt}`;
  }
  if (record.kind === "tool_result_excerpt") {
    return `Tool result: ${excerpt}`;
  }
  if (record.kind === "document_excerpt") {
    return `File evidence: ${excerpt}`;
  }

  return excerpt;
}

function summarizeEpisodes(episodes: EpisodeMemory[]): string | undefined {
  if (episodes.length === 0) {
    return undefined;
  }

  return episodes
    .slice(0, 2)
    .map((episode) => `- ${episode.summary}`)
    .join("\n");
}

function renderArchiveSummary(archive: SessionArchive): string {
  const segments = [archive.summary];

  if (archive.unresolvedItems.length > 0) {
    segments.push(`Open loops: ${archive.unresolvedItems.join(", ")}`);
  }
  if (archive.keyDecisions.length > 0) {
    segments.push(`Key decisions: ${archive.keyDecisions.join(", ")}`);
  }

  return segments.join(" ").trim();
}

function summarizeArchives(archives: SessionArchive[]): string | undefined {
  if (archives.length === 0) {
    return undefined;
  }

  return archives
    .slice(0, 2)
    .map((archive) => `- ${renderArchiveSummary(archive)}`)
    .join("\n");
}

function summarizeDurableMemory(input: {
  archives: SessionArchive[];
  candidateOrder?: string[];
  episodes: EpisodeMemory[];
  facts: FactMemory[];
  references: ReferenceMemory[];
}): string | undefined {
  if (!input.candidateOrder || input.candidateOrder.length === 0) {
    return undefined;
  }

  const candidatesById = new Map<string, string>();
  for (const fact of input.facts.filter((item) => item.lifecycle === "active")) {
    candidatesById.set(fact.id, `Fact: ${fact.content}`);
  }
  for (const reference of input.references) {
    candidatesById.set(
      reference.id,
      `Reference: ${reference.title} (${reference.pointer})`,
    );
  }
  for (const archive of input.archives) {
    candidatesById.set(archive.id, `Session archive: ${renderArchiveSummary(archive)}`);
  }
  for (const episode of input.episodes) {
    candidatesById.set(episode.id, `Episode: ${episode.summary}`);
  }

  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const candidateId of input.candidateOrder) {
    const candidate = candidatesById.get(candidateId);
    if (!candidate || seen.has(candidateId)) {
      continue;
    }

    ordered.push(`- ${candidate}`);
    seen.add(candidateId);
  }

  for (const [candidateId, candidate] of candidatesById) {
    if (seen.has(candidateId)) {
      continue;
    }

    ordered.push(`- ${candidate}`);
  }

  return ordered.length > 0 ? ordered.join("\n") : undefined;
}

function summarizeEvidence(evidence: EvidenceRecord[]): string | undefined {
  if (evidence.length === 0) {
    return undefined;
  }

  return evidence
    .slice(0, 3)
    .map((record) => `- ${summarizeEvidenceRecord(record)}`)
    .join("\n");
}

function summarizeWorkingMemory(
  workingMemory: WorkingMemorySnapshot | null,
): string | undefined {
  if (!workingMemory) {
    return undefined;
  }

  const segments: string[] = [];
  if (workingMemory.currentGoal) {
    segments.push(`Current goal: ${workingMemory.currentGoal}`);
  }
  if (workingMemory.openLoops.length > 0) {
    segments.push(`Open loops: ${workingMemory.openLoops.join(", ")}`);
  }

  return segments.length > 0 ? segments.join("\n") : undefined;
}

function summarizeJournal(journal: SessionJournal | null): string | undefined {
  if (!journal) {
    return undefined;
  }

  const segments = [
    journal.currentState ? `Current state: ${journal.currentState}` : undefined,
    !journal.currentState && journal.worklog.length > 0
      ? `Recent worklog: ${journal.worklog.slice(-1).join(" | ")}`
      : undefined,
  ].filter(Boolean);

  return segments.length > 0 ? segments.join("\n") : undefined;
}

export function buildMemoryPacket(input: MemoryPacketInput): MemoryPacket {
  const packet: MemoryPacket = {
    profileSummary: summarizeProfile(input.profile),
    activeContextSummary: summarizeActiveContext(input.profile),
    durableMemorySummary: summarizeDurableMemory({
      archives: input.archives,
      candidateOrder: input.durableCandidateOrder,
      episodes: input.episodes,
      facts: input.facts,
      references: input.references,
    }),
    preferenceSummary: summarizePreferences(input.preferences),
    referenceSummary: summarizeReferences(input.references),
    factSummary: summarizeFacts(input.facts, input.locale, input.routingDecision),
    feedbackSummary: summarizeFeedback(input.feedback),
    episodeSummary: summarizeEpisodes(input.episodes),
    archiveSummary: summarizeArchives(input.archives),
    evidenceSummary: summarizeEvidence(input.evidence),
    workingMemorySummary: summarizeWorkingMemory(input.workingMemory),
    journalSummary: summarizeJournal(input.journal),
    renderingProfile: input.routingDecision?.retrievalProfile,
  };

  packet.debug = {
    omittedSections: [],
    estimatedTokens: estimateTokens(JSON.stringify(packet)),
  };

  return packet;
}

function trimSections(
  sections: Array<{ title: string; body: string }>,
  maxTokens?: number,
) {
  if (!maxTokens) {
    return {
      sections,
      omittedSections: [],
    };
  }

  const kept: typeof sections = [];
  const omittedSections: string[] = [];
  let tokens = 0;

  for (const section of sections) {
    const sectionText = `## ${section.title}\n${section.body}`;
    const nextTokens = tokens + estimateTokens(sectionText);

    if (kept.length > 0 && nextTokens > maxTokens) {
      omittedSections.push(section.title);
      continue;
    }

    kept.push(section);
    tokens = nextTokens;
  }

  return {
    sections: kept,
    omittedSections,
  };
}

function buildRenderableSections(
  packet: MemoryPacket,
  renderingProfileOverride?: RetrievalProfile,
) {
  const durableMemorySections = packet.durableMemorySummary
    ? [
        {
          key: "durableMemorySummary" as const,
          title: "Durable Memory",
          body: packet.durableMemorySummary,
        },
      ]
    : [
        {
          key: "factSummary" as const,
          title: "Facts",
          body: packet.factSummary,
        },
        {
          key: "referenceSummary" as const,
          title: "References",
          body: packet.referenceSummary,
        },
        {
          key: "episodeSummary" as const,
          title: "Relevant Episodes",
          body: packet.episodeSummary,
        },
        {
          key: "archiveSummary" as const,
          title: "Session Archive",
          body: packet.archiveSummary,
        },
      ];

  const renderingProfile = renderingProfileOverride ?? packet.renderingProfile;

  if (renderingProfile === "coding_agent") {
    return [
      {
        key: "feedbackSummary" as const,
        title: "Procedural Memory",
        body: packet.feedbackSummary,
      },
      {
        key: "workingMemorySummary" as const,
        title: "Working Memory",
        body: packet.workingMemorySummary,
      },
      {
        key: "journalSummary" as const,
        title: "Session Journal",
        body: packet.journalSummary,
      },
      {
        key: "evidenceSummary" as const,
        title: "Evidence",
        body: packet.evidenceSummary,
      },
      ...durableMemorySections,
      {
        key: "profileSummary" as const,
        title: "Profile",
        body: packet.profileSummary,
      },
      {
        key: "activeContextSummary" as const,
        title: "Active Context",
        body: packet.activeContextSummary,
      },
      {
        key: "preferenceSummary" as const,
        title: "Preferences",
        body: packet.preferenceSummary,
      },
    ].filter(
      (
        section,
      ): section is {
        key:
          | "profileSummary"
          | "activeContextSummary"
          | "durableMemorySummary"
          | "feedbackSummary"
          | "preferenceSummary"
          | "referenceSummary"
          | "factSummary"
          | "episodeSummary"
          | "archiveSummary"
          | "evidenceSummary"
          | "workingMemorySummary"
          | "journalSummary";
        title: string;
        body: string;
      } => Boolean(section.body),
    );
  }

  return [
    {
      key: "profileSummary" as const,
      title: "Profile",
      body: packet.profileSummary,
    },
    {
      key: "activeContextSummary" as const,
      title: "Active Context",
      body: packet.activeContextSummary,
    },
    ...durableMemorySections,
    {
      key: "feedbackSummary" as const,
      title: "Procedural Memory",
      body: packet.feedbackSummary,
    },
    {
      key: "preferenceSummary" as const,
      title: "Preferences",
      body: packet.preferenceSummary,
    },
    {
      key: "workingMemorySummary" as const,
      title: "Working Memory",
      body: packet.workingMemorySummary,
    },
    {
      key: "journalSummary" as const,
      title: "Session Journal",
      body: packet.journalSummary,
    },
    {
      key: "evidenceSummary" as const,
      title: "Evidence",
      body: packet.evidenceSummary,
    },
  ].filter(
    (
      section,
    ): section is {
      key:
        | "profileSummary"
        | "activeContextSummary"
        | "durableMemorySummary"
        | "feedbackSummary"
        | "preferenceSummary"
        | "referenceSummary"
        | "factSummary"
        | "episodeSummary"
        | "archiveSummary"
        | "evidenceSummary"
        | "workingMemorySummary"
        | "journalSummary";
      title: string;
      body: string;
    } => Boolean(section.body),
  );
}

export function renderMemoryPacket(
  packet: MemoryPacket,
  output: "json" | "markdown" | "system_prompt_fragment" | "developer_prompt_fragment",
  maxTokens?: number,
  renderingProfileOverride?: RetrievalProfile,
): { content: string; estimatedTokens: number; omittedSections: string[] } {
  const sections = buildRenderableSections(packet, renderingProfileOverride);
  const { sections: kept, omittedSections } = trimSections(
    sections.map(({ title, body }) => ({ title, body })),
    maxTokens,
  );

  if (output === "json") {
    const keptTitles = new Set(kept.map((section) => section.title));
    const trimmedPacket: MemoryPacket = {
      renderingProfile: renderingProfileOverride ?? packet.renderingProfile,
      debug: {
        omittedSections,
        estimatedTokens: 0,
      },
    };

    for (const section of sections) {
      if (!keptTitles.has(section.title)) {
        continue;
      }

      trimmedPacket[section.key] = section.body;
    }

    const content = JSON.stringify(trimmedPacket);
    trimmedPacket.debug = {
      omittedSections,
      estimatedTokens: estimateTokens(content),
    };

    return {
      content: JSON.stringify(trimmedPacket),
      estimatedTokens: trimmedPacket.debug.estimatedTokens,
      omittedSections,
    };
  }

  const markdownContent = kept
    .map((section) => `## ${section.title}\n${section.body}`)
    .join("\n\n");

  if (output === "markdown") {
    return {
      content: markdownContent,
      estimatedTokens: estimateTokens(markdownContent),
      omittedSections,
    };
  }

  if (output === "system_prompt_fragment") {
    const content = [
      "User memory context:",
      ...kept.map((section) => `${section.title}: ${section.body.replace(/\n/g, " ")}`),
    ].join("\n");

    return {
      content,
      estimatedTokens: estimateTokens(content),
      omittedSections,
    };
  }

  const content = [
    "Developer memory notes:",
    ...kept.map((section) => `${section.title}: ${section.body.replace(/\n/g, " ")}`),
    omittedSections.length > 0
      ? `Omitted sections: ${omittedSections.join(", ")}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    content,
    estimatedTokens: estimateTokens(content),
    omittedSections,
  };
}
