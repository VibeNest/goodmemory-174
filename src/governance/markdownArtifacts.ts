import type {
  ArtifactSpillRecord,
  EpisodeMemory,
  FactMemory,
  FeedbackMemory,
  PreferenceMemory,
  ReferenceMemory,
  SessionJournal,
  UserProfile,
  WorkingMemorySnapshot,
} from "../domain/records";
import type { MemoryScope } from "../domain/scope";
import type { EvidenceRecord } from "../evidence/contracts";
import type {
  ExperienceRecord,
  LearningProposal,
  PromotionRecord,
  SessionArchive,
} from "../evolution/contracts";

export interface MarkdownArtifactFile {
  content: string;
  kind: "memory" | "session" | "user";
  relativePath: string;
  sessionId?: string;
}

export interface MarkdownArtifactBundle {
  files: MarkdownArtifactFile[];
  rootPath: string;
}

interface MarkdownArtifactInput {
  scope: MemoryScope;
  durable: {
    profile: UserProfile | null;
    preferences: PreferenceMemory[];
    references: ReferenceMemory[];
    facts: FactMemory[];
    feedback: FeedbackMemory[];
    episodes: EpisodeMemory[];
    archives: SessionArchive[];
    evidence: EvidenceRecord[];
    experiences: ExperienceRecord[];
    proposals: LearningProposal[];
    promotions: PromotionRecord[];
  };
  runtime?: {
    workingMemory: WorkingMemorySnapshot | null;
    journal: SessionJournal | null;
    spills: ArtifactSpillRecord[];
  };
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function sanitizeMarkdownInline(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\t/g, "\\t")
    .replace(/\r\n?/g, "\n")
    .replace(/\n/g, "\\n");
}

function buildRootPath(scope: MemoryScope): string {
  const segments = [".goodmemory", "users", encodeURIComponent(scope.userId)];

  if (scope.tenantId) {
    segments.push("tenants", encodeURIComponent(scope.tenantId));
  }
  if (scope.workspaceId) {
    segments.push("workspaces", encodeURIComponent(scope.workspaceId));
  }
  if (scope.agentId) {
    segments.push("agents", encodeURIComponent(scope.agentId));
  }
  if (scope.sessionId) {
    segments.push("sessions", encodeURIComponent(scope.sessionId));
  }

  return segments.join("/");
}

function renderSection(title: string, lines: string[]): string {
  return [
    `## ${sanitizeMarkdownInline(title)}`,
    ...(lines.length > 0 ? lines : ["- none"]),
  ].join("\n");
}

function renderDocument(title: string, sections: string[]): string {
  const kept = sections.filter((section) => section.trim().length > 0);

  return [`# ${sanitizeMarkdownInline(title)}`, ...kept.flatMap((section) => ["", section])].join("\n");
}

function renderProfileLines(profile: UserProfile | null): string[] {
  if (!profile) {
    return [];
  }

  return [
    profile.identity.name ? `- Name: ${sanitizeMarkdownInline(profile.identity.name)}` : undefined,
    profile.identity.role ? `- Role: ${sanitizeMarkdownInline(profile.identity.role)}` : undefined,
    profile.identity.organization
      ? `- Organization: ${sanitizeMarkdownInline(profile.identity.organization)}`
      : undefined,
    profile.identity.location
      ? `- Location: ${sanitizeMarkdownInline(profile.identity.location)}`
      : undefined,
    profile.identity.timezone
      ? `- Timezone: ${sanitizeMarkdownInline(profile.identity.timezone)}`
      : undefined,
    profile.identity.languagePreference
      ? `- Language: ${sanitizeMarkdownInline(profile.identity.languagePreference)}`
      : undefined,
  ].filter((line): line is string => Boolean(line));
}

function renderActiveContextLines(profile: UserProfile | null): string[] {
  if (!profile) {
    return [];
  }

  return [
    ...profile.activeContext.currentProjects.map(
      (project) => `- Current project: ${sanitizeMarkdownInline(project)}`,
    ),
    ...profile.activeContext.goals.map((goal) => `- Goal: ${sanitizeMarkdownInline(goal)}`),
  ];
}

function sortPreferences(preferences: PreferenceMemory[]): PreferenceMemory[] {
  return [...preferences].sort((left, right) => {
    const updated = right.updatedAt.localeCompare(left.updatedAt);
    if (updated !== 0) {
      return updated;
    }

    return compareStrings(left.category, right.category);
  });
}

function sortFacts(facts: FactMemory[]): FactMemory[] {
  return [...facts].sort((left, right) => {
    if (left.lifecycle !== right.lifecycle) {
      return left.lifecycle === "active" ? -1 : 1;
    }

    const updated = right.updatedAt.localeCompare(left.updatedAt);
    if (updated !== 0) {
      return updated;
    }

    return compareStrings(left.content, right.content);
  });
}

function sortReferences(references: ReferenceMemory[]): ReferenceMemory[] {
  return [...references].sort((left, right) => {
    if (left.lifecycle !== right.lifecycle) {
      return left.lifecycle === "active" ? -1 : 1;
    }

    const updated = right.updatedAt.localeCompare(left.updatedAt);
    if (updated !== 0) {
      return updated;
    }

    return compareStrings(left.pointer, right.pointer);
  });
}

function sortFeedback(feedback: FeedbackMemory[]): FeedbackMemory[] {
  return [...feedback].sort((left, right) => {
    if (left.lifecycle !== right.lifecycle) {
      return left.lifecycle === "active" ? -1 : 1;
    }

    const updated = right.updatedAt.localeCompare(left.updatedAt);
    if (updated !== 0) {
      return updated;
    }

    return compareStrings(left.rule, right.rule);
  });
}

function sortEpisodes(episodes: EpisodeMemory[]): EpisodeMemory[] {
  return [...episodes].sort((left, right) => {
    const created = right.createdAt.localeCompare(left.createdAt);
    if (created !== 0) {
      return created;
    }

    return compareStrings(left.summary, right.summary);
  });
}

function sortArchives(archives: SessionArchive[]): SessionArchive[] {
  return [...archives].sort((left, right) => {
    const archived = right.archivedAt.localeCompare(left.archivedAt);
    if (archived !== 0) {
      return archived;
    }

    return compareStrings(left.sessionId, right.sessionId);
  });
}

function sortEvidence(evidence: EvidenceRecord[]): EvidenceRecord[] {
  return [...evidence].sort((left, right) => {
    const created = right.createdAt.localeCompare(left.createdAt);
    if (created !== 0) {
      return created;
    }

    return compareStrings(left.id, right.id);
  });
}

function sortExperiences(experiences: ExperienceRecord[]): ExperienceRecord[] {
  return [...experiences].sort((left, right) => {
    const created = right.createdAt.localeCompare(left.createdAt);
    if (created !== 0) {
      return created;
    }

    return compareStrings(left.id, right.id);
  });
}

function sortSpills(spills: ArtifactSpillRecord[]): ArtifactSpillRecord[] {
  return [...spills].sort((left, right) => {
    const created = right.createdAt.localeCompare(left.createdAt);
    if (created !== 0) {
      return created;
    }

    return compareStrings(left.id, right.id);
  });
}

function sortProposals(proposals: LearningProposal[]): LearningProposal[] {
  return [...proposals].sort((left, right) => {
    const updated = right.updatedAt.localeCompare(left.updatedAt);
    if (updated !== 0) {
      return updated;
    }

    return compareStrings(left.summary, right.summary);
  });
}

function sortPromotions(promotions: PromotionRecord[]): PromotionRecord[] {
  return [...promotions].sort((left, right) => {
    const decided = right.decidedAt.localeCompare(left.decidedAt);
    if (decided !== 0) {
      return decided;
    }

    return compareStrings(left.summary, right.summary);
  });
}

function renderPreferenceLines(preferences: PreferenceMemory[]): string[] {
  return sortPreferences(preferences).map(
    (preference) =>
      `- ${sanitizeMarkdownInline(preference.category)}: ${sanitizeMarkdownInline(String(preference.value))}`,
  );
}

function renderFactLines(facts: FactMemory[]): string[] {
  return sortFacts(facts).map(
    (fact) => `- [${fact.lifecycle}] ${sanitizeMarkdownInline(fact.content)}`,
  );
}

function renderReferenceLines(references: ReferenceMemory[]): string[] {
  return sortReferences(references).map(
    (reference) =>
      `- [${reference.lifecycle}] ${sanitizeMarkdownInline(reference.title)} (${sanitizeMarkdownInline(reference.pointer)})`,
  );
}

function renderFeedbackLines(feedback: FeedbackMemory[]): string[] {
  return sortFeedback(feedback).map(
    (entry) => `- [${entry.kind}] ${sanitizeMarkdownInline(entry.rule)}`,
  );
}

function renderEpisodeLines(episodes: EpisodeMemory[]): string[] {
  return sortEpisodes(episodes).map(
    (episode) => `- ${sanitizeMarkdownInline(episode.summary)}`,
  );
}

function renderArchiveLines(archives: SessionArchive[]): string[] {
  return sortArchives(archives).map((archive) => {
    const suffix =
      archive.unresolvedItems.length > 0
        ? ` Open loops: ${sanitizeMarkdownInline(archive.unresolvedItems.join(", "))}`
        : "";

    return `- ${sanitizeMarkdownInline(archive.summary)}${suffix}`;
  });
}

function renderEvidenceLines(evidence: EvidenceRecord[]): string[] {
  return sortEvidence(evidence).map(
    (record) => `- ${sanitizeMarkdownInline(record.excerpt)}`,
  );
}

function renderExperienceLines(experiences: ExperienceRecord[]): string[] {
  return sortExperiences(experiences).map(
    (experience) => `- [${experience.kind}] ${sanitizeMarkdownInline(experience.summary)}`,
  );
}

function renderProposalLines(proposals: LearningProposal[]): string[] {
  return sortProposals(proposals).map(
    (proposal) =>
      `- [${sanitizeMarkdownInline(proposal.status)}] [${sanitizeMarkdownInline(proposal.proposalType)}] ${sanitizeMarkdownInline(proposal.summary)}`,
  );
}

function renderPromotionLines(promotions: PromotionRecord[]): string[] {
  return sortPromotions(promotions).map(
    (promotion) =>
      `- [${sanitizeMarkdownInline(promotion.decision)}] ${sanitizeMarkdownInline(promotion.summary)} (proposal: ${sanitizeMarkdownInline(promotion.proposalId)}; policy=${sanitizeMarkdownInline(promotion.policyOutcome)}; verification=${sanitizeMarkdownInline(promotion.verificationOutcome)}; eval=${sanitizeMarkdownInline(promotion.evalOutcome)})`,
  );
}

function renderWorkingMemoryLines(
  workingMemory: WorkingMemorySnapshot | null,
): string[] {
  if (!workingMemory) {
    return [];
  }

  return [
    workingMemory.currentGoal
      ? `- Current goal: ${sanitizeMarkdownInline(workingMemory.currentGoal)}`
      : undefined,
    ...workingMemory.openLoops.map(
      (loop) => `- Open loop: ${sanitizeMarkdownInline(loop)}`,
    ),
    ...(workingMemory.temporaryDecisions ?? []).map(
      (decision) => `- Temporary decision: ${sanitizeMarkdownInline(decision)}`,
    ),
  ].filter((line): line is string => Boolean(line));
}

function renderJournalLines(journal: SessionJournal | null): string[] {
  if (!journal) {
    return [];
  }

  return [
    journal.currentState
      ? `- Current state: ${sanitizeMarkdownInline(journal.currentState)}`
      : undefined,
    ...journal.worklog.map((entry) => `- Worklog: ${sanitizeMarkdownInline(entry)}`),
    ...(journal.filesAndFunctions ?? []).map(
      (entry) => `- File/Function: ${sanitizeMarkdownInline(entry)}`,
    ),
  ].filter((line): line is string => Boolean(line));
}

function renderSpillLines(spills: ArtifactSpillRecord[]): string[] {
  return sortSpills(spills).map(
    (spill) =>
      `- [${spill.kind}] ${sanitizeMarkdownInline(spill.sourceId)}: ${sanitizeMarkdownInline(spill.preview)}`,
  );
}

function renderScopeLines(scope: MemoryScope): string[] {
  return [
    `- userId: ${sanitizeMarkdownInline(scope.userId)}`,
    scope.tenantId ? `- tenantId: ${sanitizeMarkdownInline(scope.tenantId)}` : undefined,
    scope.workspaceId
      ? `- workspaceId: ${sanitizeMarkdownInline(scope.workspaceId)}`
      : undefined,
    scope.agentId ? `- agentId: ${sanitizeMarkdownInline(scope.agentId)}` : undefined,
    scope.sessionId
      ? `- scoped sessionId: ${sanitizeMarkdownInline(scope.sessionId)}`
      : undefined,
  ].filter((line): line is string => Boolean(line));
}

function buildSessionArtifactRelativePath(
  scope: MemoryScope,
  sessionId: string,
): string {
  if (scope.sessionId === sessionId) {
    return "session.md";
  }

  return `sessions/${encodeURIComponent(sessionId)}.md`;
}

function collectSessionIds(input: MarkdownArtifactInput): string[] {
  const sessionIds = new Set<string>();

  if (input.scope.sessionId) {
    sessionIds.add(input.scope.sessionId);
  }

  for (const record of [
    ...input.durable.preferences,
    ...input.durable.references,
    ...input.durable.facts,
    ...input.durable.feedback,
    ...input.durable.episodes,
    ...input.durable.archives,
    ...input.durable.evidence,
    ...input.durable.experiences,
    ...input.durable.proposals,
    ...input.durable.promotions,
  ]) {
    if (record.sessionId) {
      sessionIds.add(record.sessionId);
    }
  }

  if (input.runtime?.workingMemory?.sessionId) {
    sessionIds.add(input.runtime.workingMemory.sessionId);
  }
  if (input.runtime?.journal?.sessionId) {
    sessionIds.add(input.runtime.journal.sessionId);
  }
  for (const spill of input.runtime?.spills ?? []) {
    if (spill.scope.sessionId) {
      sessionIds.add(spill.scope.sessionId);
    }
  }

  return [...sessionIds].sort(compareStrings);
}

function buildUserArtifact(input: MarkdownArtifactInput): MarkdownArtifactFile {
  return {
    kind: "user",
    relativePath: "user.md",
    content: renderDocument("User Memory", [
      renderSection("Profile", renderProfileLines(input.durable.profile)),
      renderSection("Active Context", renderActiveContextLines(input.durable.profile)),
      renderSection("Preferences", renderPreferenceLines(input.durable.preferences)),
      renderSection("Feedback", renderFeedbackLines(input.durable.feedback)),
    ]),
  };
}

function buildMemoryArtifact(input: MarkdownArtifactInput): MarkdownArtifactFile {
  return {
    kind: "memory",
    relativePath: "MEMORY.md",
    content: renderDocument("MEMORY", [
      renderSection("Scope", renderScopeLines(input.scope)),
      renderSection("Profile", renderProfileLines(input.durable.profile)),
      renderSection("Preferences", renderPreferenceLines(input.durable.preferences)),
      renderSection("Feedback", renderFeedbackLines(input.durable.feedback)),
      renderSection("References", renderReferenceLines(input.durable.references)),
      renderSection("Facts", renderFactLines(input.durable.facts)),
      renderSection("Episodes", renderEpisodeLines(input.durable.episodes)),
      renderSection("Session Archives", renderArchiveLines(input.durable.archives)),
      renderSection("Evidence", renderEvidenceLines(input.durable.evidence)),
      renderSection("Experiences", renderExperienceLines(input.durable.experiences)),
      renderSection(
        "Learning Proposals",
        renderProposalLines(input.durable.proposals),
      ),
      renderSection("Promotions", renderPromotionLines(input.durable.promotions)),
      renderSection(
        "Working Memory",
        renderWorkingMemoryLines(input.runtime?.workingMemory ?? null),
      ),
      renderSection(
        "Session Journal",
        renderJournalLines(input.runtime?.journal ?? null),
      ),
      renderSection(
        "Artifact Spills",
        renderSpillLines(input.runtime?.spills ?? []),
      ),
    ]),
  };
}

function buildSessionArtifact(
  input: MarkdownArtifactInput,
  sessionId: string,
): MarkdownArtifactFile {
  const workingMemory =
    input.runtime?.workingMemory?.sessionId === sessionId
      ? input.runtime.workingMemory
      : null;
  const journal =
    input.runtime?.journal?.sessionId === sessionId ? input.runtime.journal : null;
  const spills = (input.runtime?.spills ?? []).filter(
    (spill) => spill.scope.sessionId === sessionId,
  );

  return {
    kind: "session",
    relativePath: buildSessionArtifactRelativePath(input.scope, sessionId),
    sessionId,
    content: renderDocument(`Session Memory: ${sessionId}`, [
      renderSection("Scope", [
        ...renderScopeLines(input.scope),
        `- sessionId: ${sanitizeMarkdownInline(sessionId)}`,
      ]),
      renderSection(
        "Preferences",
        renderPreferenceLines(
          input.durable.preferences.filter((record) => record.sessionId === sessionId),
        ),
      ),
      renderSection(
        "References",
        renderReferenceLines(
          input.durable.references.filter((record) => record.sessionId === sessionId),
        ),
      ),
      renderSection(
        "Facts",
        renderFactLines(
          input.durable.facts.filter((record) => record.sessionId === sessionId),
        ),
      ),
      renderSection(
        "Feedback",
        renderFeedbackLines(
          input.durable.feedback.filter((record) => record.sessionId === sessionId),
        ),
      ),
      renderSection(
        "Episodes",
        renderEpisodeLines(
          input.durable.episodes.filter((record) => record.sessionId === sessionId),
        ),
      ),
      renderSection(
        "Session Archives",
        renderArchiveLines(
          input.durable.archives.filter((record) => record.sessionId === sessionId),
        ),
      ),
      renderSection(
        "Evidence",
        renderEvidenceLines(
          input.durable.evidence.filter((record) => record.sessionId === sessionId),
        ),
      ),
      renderSection(
        "Experiences",
        renderExperienceLines(
          input.durable.experiences.filter((record) => record.sessionId === sessionId),
        ),
      ),
      renderSection(
        "Learning Proposals",
        renderProposalLines(
          input.durable.proposals.filter((record) => record.sessionId === sessionId),
        ),
      ),
      renderSection(
        "Promotions",
        renderPromotionLines(
          input.durable.promotions.filter((record) => record.sessionId === sessionId),
        ),
      ),
      renderSection("Working Memory", renderWorkingMemoryLines(workingMemory)),
      renderSection("Session Journal", renderJournalLines(journal)),
      renderSection("Artifact Spills", renderSpillLines(spills)),
    ]),
  };
}

export function buildMarkdownArtifacts(
  input: MarkdownArtifactInput,
): MarkdownArtifactBundle {
  const files: MarkdownArtifactFile[] = [
    buildUserArtifact(input),
    buildMemoryArtifact(input),
    ...collectSessionIds(input).map((sessionId) =>
      buildSessionArtifact(input, sessionId),
    ),
  ];

  return {
    rootPath: buildRootPath(input.scope),
    files,
  };
}
