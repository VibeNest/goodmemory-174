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
  kind: "archive" | "memory" | "playbook" | "session" | "user";
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

function renderOptionalPlaybookSection(title: string, lines: string[]): string {
  return [
    `## ${sanitizeMarkdownInline(title)}`,
    ...(lines.length > 0 ? lines : ["<!-- intentionally empty -->"]),
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

function renderDomainMetadataSuffix(record: {
  tags?: string[];
  attributes?: Record<string, string | number | boolean | null>;
}): string {
  const parts = [
    record.tags && record.tags.length > 0
      ? `tags: ${[...record.tags]
          .sort(compareStrings)
          .map(sanitizeMarkdownInline)
          .join(", ")}`
      : undefined,
    record.attributes && Object.keys(record.attributes).length > 0
      ? `attributes: ${Object.entries(record.attributes)
          .sort(([left], [right]) => compareStrings(left, right))
          .map(([key, value]) =>
            `${sanitizeMarkdownInline(key)}=${sanitizeMarkdownInline(String(value))}`,
          )
          .join(", ")}`
      : undefined,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? ` {${parts.join("; ")}}` : "";
}

function renderPreferenceLines(preferences: PreferenceMemory[]): string[] {
  return sortPreferences(preferences).map(
    (preference) =>
      `- ${sanitizeMarkdownInline(preference.category)}: ${sanitizeMarkdownInline(String(preference.value))}${renderDomainMetadataSuffix(preference)}`,
  );
}

function renderFactLines(facts: FactMemory[]): string[] {
  return sortFacts(facts).map(
    (fact) =>
      `- [${fact.lifecycle}] ${sanitizeMarkdownInline(fact.content)}${renderDomainMetadataSuffix(fact)}`,
  );
}

function renderReferenceLines(references: ReferenceMemory[]): string[] {
  return sortReferences(references).map(
    (reference) =>
      `- [${reference.lifecycle}] ${sanitizeMarkdownInline(reference.title)} (${sanitizeMarkdownInline(reference.pointer)})${renderDomainMetadataSuffix(reference)}`,
  );
}

function renderFeedbackLines(feedback: FeedbackMemory[]): string[] {
  return sortFeedback(feedback).map(
    (entry) =>
      `- [${entry.kind}] ${sanitizeMarkdownInline(entry.rule)}${renderDomainMetadataSuffix(entry)}`,
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

function slugifySegment(value: string): string {
  const ascii = value.normalize("NFKD").replace(/[^\x00-\x7F]/g, "");
  const slug = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length > 0 ? slug : "playbook";
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

function collectActiveSessionIds(input: MarkdownArtifactInput): string[] {
  const sessionIds = new Set<string>();

  if (input.runtime?.workingMemory?.sessionId) {
    sessionIds.add(input.runtime.workingMemory.sessionId);
  }
  if (input.runtime?.journal?.sessionId) {
    sessionIds.add(input.runtime.journal.sessionId);
  }

  return [...sessionIds].sort(compareStrings);
}

function buildArchiveArtifactRelativePath(archive: SessionArchive): string {
  const archivedAt = new Date(archive.archivedAt);
  const year = Number.isNaN(archivedAt.getTime())
    ? "unknown"
    : String(archivedAt.getUTCFullYear()).padStart(4, "0");
  const month = Number.isNaN(archivedAt.getTime())
    ? "00"
    : String(archivedAt.getUTCMonth() + 1).padStart(2, "0");

  return `archive/${year}/${month}/${encodeURIComponent(archive.sessionId)}.md`;
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

function buildPlaybookArtifacts(input: MarkdownArtifactInput): MarkdownArtifactFile[] {
  const usedRelativePaths = new Set<string>();
  const validatedPatterns = sortFeedback(input.durable.feedback).filter(
    (entry) => entry.kind === "validated_pattern" && entry.lifecycle === "active",
  );

  return validatedPatterns.map((pattern) => {
    const baseSlug = slugifySegment(pattern.rule);
    let relativePath = `playbooks/${baseSlug}.md`;

    if (usedRelativePaths.has(relativePath)) {
      relativePath = `playbooks/${baseSlug}-${slugifySegment(pattern.id)}.md`;
    }

    usedRelativePaths.add(relativePath);
    const derivedBasePath = relativePath.slice(0, -".md".length);

    const lineageLines = [
      `- sourceMethod: ${sanitizeMarkdownInline(pattern.source.method)}`,
      pattern.source.sessionId
        ? `- sourceSessionId: ${sanitizeMarkdownInline(pattern.source.sessionId)}`
        : undefined,
      pattern.evidence && pattern.evidence.length > 0
        ? `- evidenceIds: ${sanitizeMarkdownInline(pattern.evidence.join(", "))}`
        : undefined,
    ].filter((line): line is string => Boolean(line));
    const canonicalPatternLines = [
      `- canonicalMemoryId: ${sanitizeMarkdownInline(pattern.id)}`,
      `- lifecycle: ${sanitizeMarkdownInline(pattern.lifecycle)}`,
      pattern.appliesTo
        ? `- appliesTo: ${sanitizeMarkdownInline(pattern.appliesTo)}`
        : undefined,
      pattern.workspaceId
        ? `- workspaceId: ${sanitizeMarkdownInline(pattern.workspaceId)}`
        : undefined,
      pattern.agentId
        ? `- agentId: ${sanitizeMarkdownInline(pattern.agentId)}`
        : undefined,
    ].filter((line): line is string => Boolean(line));

    return [
      {
        kind: "playbook" as const,
        relativePath,
        content: renderDocument(`Playbook: ${pattern.rule}`, [
          renderSection("Canonical Pattern", canonicalPatternLines),
          renderSection("Guidance", [`- ${sanitizeMarkdownInline(pattern.rule)}`]),
          renderOptionalPlaybookSection(
            "Why",
            pattern.why ? [`- ${sanitizeMarkdownInline(pattern.why)}`] : [],
          ),
          renderSection("Lineage", lineageLines),
        ]),
      },
      {
        kind: "playbook" as const,
        relativePath: `${derivedBasePath}.prompt.md`,
        content: renderDocument(`Prompt Snippet: ${pattern.rule}`, [
          renderSection("Use When", [
            pattern.appliesTo
              ? `- appliesTo: ${sanitizeMarkdownInline(pattern.appliesTo)}`
              : "- appliesTo: general",
          ]),
          renderSection("Instruction", [`- ${sanitizeMarkdownInline(pattern.rule)}`]),
          renderSection("Lineage", lineageLines),
        ]),
      },
      {
        kind: "playbook" as const,
          relativePath: `${derivedBasePath}.skill.md`,
          content: renderDocument(`Skill Snippet: ${pattern.rule}`, [
            renderSection("Metadata", canonicalPatternLines),
            renderSection("Procedure", [`- ${sanitizeMarkdownInline(pattern.rule)}`]),
            renderOptionalPlaybookSection(
              "Why",
              pattern.why ? [`- ${sanitizeMarkdownInline(pattern.why)}`] : [],
            ),
          ]),
        },
      ];
  }).flat();
}

function buildArchiveArtifacts(input: MarkdownArtifactInput): MarkdownArtifactFile[] {
  return sortArchives(input.durable.archives).map((archive) => ({
    kind: "archive",
    relativePath: buildArchiveArtifactRelativePath(archive),
    sessionId: archive.sessionId,
    content: renderDocument(`Archive Recap: ${archive.sessionId}`, [
      renderSection("Summary", [`- ${sanitizeMarkdownInline(archive.summary)}`]),
      renderSection(
        "Key Decisions",
        archive.keyDecisions.map((decision) => `- ${sanitizeMarkdownInline(decision)}`),
      ),
      renderSection(
        "Unresolved Loops",
        archive.unresolvedItems.map((item) => `- ${sanitizeMarkdownInline(item)}`),
      ),
      renderSection(
        "Referenced Artifacts",
        archive.referencedArtifacts.map(
          (artifact) => `- ${sanitizeMarkdownInline(artifact)}`,
        ),
      ),
      renderSection(
        "Lineage",
        [
          `- archiveId: ${sanitizeMarkdownInline(archive.id)}`,
          `- sourceSessionIds: ${sanitizeMarkdownInline(archive.sourceSessionIds.join(", "))}`,
          archive.scopeLineage.length > 0
            ? `- scopeLineage: ${sanitizeMarkdownInline(archive.scopeLineage.join(", "))}`
            : undefined,
        ].filter((line): line is string => Boolean(line)),
      ),
    ]),
  }));
}

export function buildMarkdownArtifacts(
  input: MarkdownArtifactInput,
): MarkdownArtifactBundle {
  const files: MarkdownArtifactFile[] = [
    buildUserArtifact(input),
    buildMemoryArtifact(input),
    ...collectActiveSessionIds(input).map((sessionId) =>
      buildSessionArtifact(input, sessionId),
    ),
    ...buildArchiveArtifacts(input),
    ...buildPlaybookArtifacts(input),
  ];

  return {
    rootPath: buildRootPath(input.scope),
    files,
  };
}
