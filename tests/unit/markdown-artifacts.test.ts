import { describe, expect, it } from "bun:test";
import type { ArtifactSpillRecord } from "../../src/domain/records";
import {
  createFactMemory,
  createFeedbackMemory,
  createPreferenceMemory,
  createReferenceMemory,
  createSessionJournal,
  createUserProfile,
  createWorkingMemorySnapshot,
} from "../../src/domain/records";
import { createMemorySource } from "../../src/domain/provenance";
import { createEvidenceRecord } from "../../src/evidence/contracts";
import {
  createExperienceRecord,
  createSessionArchive,
} from "../../src/evolution/contracts";
import { buildMarkdownArtifacts } from "../../src/governance/markdownArtifacts";

function buildProjectionInput() {
  const source = createMemorySource({
    method: "explicit",
    extractedAt: "2026-04-02T00:00:00.000Z",
    sessionId: "s-1",
  });
  const spill: ArtifactSpillRecord = {
    id: "spill-1",
    scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
    kind: "tool_result",
    sourceId: "tool-1",
    preview: "Large tool payload preview",
    replacementText: "[spill-1]",
    storageUri: "memory://spill-1",
    originalBytes: 128,
    createdAt: "2026-04-02T00:00:00.000Z",
  };

  return {
    scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" } as const,
    durable: {
      profile: createUserProfile({
        userId: "u-1",
        identity: {
          name: "Lin",
          role: "Robotics engineer",
        },
        activeContext: {
          goals: ["Finish rollout"],
          currentProjects: ["Migration rollout"],
        },
        createdAt: "2026-04-02T00:00:00.000Z",
        updatedAt: "2026-04-02T00:00:00.000Z",
      }),
      preferences: [
        createPreferenceMemory({
          id: "pref-1",
          userId: "u-1",
          workspaceId: "workspace-a",
          sessionId: "s-1",
          category: "response_style",
          value: "bullet points",
          source,
          updatedAt: "2026-04-02T00:00:00.000Z",
        }),
      ],
      references: [
        createReferenceMemory({
          id: "ref-1",
          userId: "u-1",
          workspaceId: "workspace-a",
          sessionId: "s-1",
          title: "Runbook",
          pointer: "docs/runbook.md",
          source,
          updatedAt: "2026-04-02T00:00:00.000Z",
          createdAt: "2026-04-02T00:00:00.000Z",
        }),
      ],
      facts: [
        createFactMemory({
          id: "fact-1",
          userId: "u-1",
          workspaceId: "workspace-a",
          sessionId: "s-1",
          category: "project",
          content: "Migration rollout is blocked on prod verification.",
          source,
          updatedAt: "2026-04-02T00:00:00.000Z",
          createdAt: "2026-04-02T00:00:00.000Z",
        }),
      ],
      feedback: [
        createFeedbackMemory({
          id: "fb-1",
          userId: "u-1",
          workspaceId: "workspace-a",
          sessionId: "s-1",
          rule: "Keep answers concise.",
          kind: "do",
          source,
          updatedAt: "2026-04-02T00:00:00.000Z",
        }),
      ],
      episodes: [],
      archives: [
        createSessionArchive({
          id: "archive-1",
          userId: "u-1",
          workspaceId: "workspace-a",
          sessionId: "s-1",
          summary: "Session paused after rollout verification planning.",
          unresolvedItems: ["verify prod"],
          createdAt: "2026-04-02T00:00:00.000Z",
          archivedAt: "2026-04-02T00:00:00.000Z",
        }),
      ],
      evidence: [
        createEvidenceRecord({
          id: "evidence-1",
          userId: "u-1",
          workspaceId: "workspace-a",
          sessionId: "s-1",
          kind: "conversation_excerpt",
          excerpt: "The user said prod verification is still blocking the rollout.",
          source,
          linkedMemoryIds: ["fact-1"],
        }),
      ],
      experiences: [
        createExperienceRecord({
          id: "experience-1",
          userId: "u-1",
          workspaceId: "workspace-a",
          sessionId: "s-1",
          kind: "session_end",
          traceId: "trace-1",
          summary: "Session ended after rollout planning.",
          createdAt: "2026-04-02T00:00:00.000Z",
        }),
      ],
    },
    runtime: {
      workingMemory: createWorkingMemorySnapshot({
        sessionId: "s-1",
        userId: "u-1",
        currentGoal: "Finish rollout",
        openLoops: ["verify prod"],
        updatedAt: "2026-04-02T00:00:00.000Z",
      }),
      journal: createSessionJournal({
        sessionId: "s-1",
        userId: "u-1",
        currentState: "Verification queued",
        worklog: ["Checked rollout status."],
        updatedAt: "2026-04-02T00:00:00.000Z",
      }),
      spills: [spill],
    },
  };
}

describe("markdown artifact projection", () => {
  it("renders deterministic scope-aware markdown artifacts from canonical memory state", () => {
    const first = buildMarkdownArtifacts(buildProjectionInput());
    const second = buildMarkdownArtifacts(buildProjectionInput());

    expect(first).toEqual(second);
    expect(first.rootPath).toBe(".goodmemory/users/u-1/workspaces/workspace-a/sessions/s-1");
    expect(first.files.map((file) => file.relativePath)).toEqual([
      "user.md",
      "MEMORY.md",
      "session.md",
    ]);
    expect(first.files[1]?.content).toContain("# MEMORY");
    expect(first.files[1]?.content).toContain("Migration rollout is blocked on prod verification.");
    expect(first.files[2]?.content).toContain("Current goal: Finish rollout");
    expect(first.files[2]?.content).toContain("Large tool payload preview");
  });

  it("namespaces session-scoped artifact bundles by session id", () => {
    const sessionOne = buildMarkdownArtifacts(buildProjectionInput());
    const sessionNine = buildMarkdownArtifacts({
      ...buildProjectionInput(),
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-9" },
    });

    expect(sessionOne.rootPath).not.toBe(sessionNine.rootPath);
  });

  it("escapes multiline memory content so markdown structure stays stable", () => {
    const artifacts = buildMarkdownArtifacts({
      ...buildProjectionInput(),
      durable: {
        ...buildProjectionInput().durable,
        facts: [
          createFactMemory({
            id: "fact-injected",
            userId: "u-1",
            workspaceId: "workspace-a",
            sessionId: "s-1",
            category: "project",
            content: "First line\n## Injected Heading\n- injected bullet",
            source: createMemorySource({
              method: "explicit",
              extractedAt: "2026-04-02T00:00:00.000Z",
              sessionId: "s-1",
            }),
            updatedAt: "2026-04-02T00:00:00.000Z",
            createdAt: "2026-04-02T00:00:00.000Z",
          }),
        ],
      },
    });

    expect(artifacts.files[1]?.content).toContain(
      "First line\\n## Injected Heading\\n- injected bullet",
    );
    expect(artifacts.files[1]?.content).not.toContain("\n## Injected Heading\n");
  });
});
