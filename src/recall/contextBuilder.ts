import type {
  EpisodeMemory,
  FactMemory,
  FeedbackMemory,
  PreferenceMemory,
  ReferenceMemory,
  SessionJournal,
  UserProfile,
  WorkingMemorySnapshot,
} from "../domain/records";

export interface MemoryPacket {
  profileSummary?: string;
  preferenceSummary?: string;
  referenceSummary?: string;
  factSummary?: string;
  feedbackSummary?: string;
  episodeSummary?: string;
  workingMemorySummary?: string;
  journalSummary?: string;
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
  workingMemory: WorkingMemorySnapshot | null;
  journal: SessionJournal | null;
}

function estimateTokens(value: string): number {
  return Math.ceil(value.length / 4);
}

function summarizeProfile(profile: UserProfile | null): string | undefined {
  if (!profile) {
    return undefined;
  }

  const segments = [profile.identity.name, profile.identity.role].filter(Boolean);
  return segments.length > 0 ? segments.join(" - ") : undefined;
}

function summarizeFacts(facts: FactMemory[]): string | undefined {
  const activeFacts = facts.filter((fact) => fact.lifecycle === "active").slice(0, 3);
  if (activeFacts.length === 0) {
    return undefined;
  }

  return activeFacts.map((fact) => `- ${fact.content}`).join("\n");
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
    .slice(0, 3);
  if (activeFeedback.length === 0) {
    return undefined;
  }

  return activeFeedback.map((item) => `- ${item.rule}`).join("\n");
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
    journal.worklog.length > 0
      ? `Recent worklog: ${journal.worklog.slice(-2).join(" | ")}`
      : undefined,
  ].filter(Boolean);

  return segments.length > 0 ? segments.join("\n") : undefined;
}

export function buildMemoryPacket(input: MemoryPacketInput): MemoryPacket {
  const packet: MemoryPacket = {
    profileSummary: summarizeProfile(input.profile),
    preferenceSummary: summarizePreferences(input.preferences),
    referenceSummary: summarizeReferences(input.references),
    factSummary: summarizeFacts(input.facts),
    feedbackSummary: summarizeFeedback(input.feedback),
    episodeSummary: summarizeEpisodes(input.episodes),
    workingMemorySummary: summarizeWorkingMemory(input.workingMemory),
    journalSummary: summarizeJournal(input.journal),
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

function buildRenderableSections(packet: MemoryPacket) {
  return [
    {
      key: "profileSummary" as const,
      title: "Profile",
      body: packet.profileSummary,
    },
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
      key: "referenceSummary" as const,
      title: "References",
      body: packet.referenceSummary,
    },
    {
      key: "factSummary" as const,
      title: "Facts",
      body: packet.factSummary,
    },
    {
      key: "episodeSummary" as const,
      title: "Relevant Episodes",
      body: packet.episodeSummary,
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
  ].filter(
    (
      section,
    ): section is {
      key:
        | "profileSummary"
        | "feedbackSummary"
        | "preferenceSummary"
        | "referenceSummary"
        | "factSummary"
        | "episodeSummary"
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
): { content: string; estimatedTokens: number; omittedSections: string[] } {
  const sections = buildRenderableSections(packet);
  const { sections: kept, omittedSections } = trimSections(
    sections.map(({ title, body }) => ({ title, body })),
    maxTokens,
  );

  if (output === "json") {
    const keptTitles = new Set(kept.map((section) => section.title));
    const trimmedPacket: MemoryPacket = {
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
