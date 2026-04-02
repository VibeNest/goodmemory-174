import type { MemoryScope } from "../../src";
import type {
  ReplayFeedbackSignal,
  ReplayMemorySession,
} from "../../src/testing/scenarioReplay";

type StoredCollection =
  | "profiles"
  | "preferences"
  | "references"
  | "facts"
  | "feedback"
  | "episodes";

type RecallCollection =
  | "profile"
  | "preferences"
  | "references"
  | "facts"
  | "feedback"
  | "episodes"
  | "workingMemory"
  | "journal";

export interface StoredExpectation {
  collection: StoredCollection;
  includes: string;
  lifecycle?: string;
  scope?: Partial<MemoryScope>;
}

export interface RecallExpectation {
  collection: RecallCollection;
  includes: string;
}

export interface AnswerExpectation {
  includes: string[];
  excludes?: string[];
}

export interface BehaviorScenarioFixture {
  id: string;
  personaId: string;
  workspaceId?: string;
  sessions: ReplayMemorySession[];
  prompt: string;
  retrievalProfile?: "general_chat" | "coding_agent";
  feedbackSignals?: ReplayFeedbackSignal[];
  finalScope?: Partial<MemoryScope>;
  expectedRemembered: StoredExpectation[];
  expectedRecalled: RecallExpectation[];
  expectedContextSnippets: string[];
  forbiddenContextSnippets?: string[];
  expectedAnswer: AnswerExpectation;
}

export const behaviorScenarios: Record<string, BehaviorScenarioFixture> = {
  identityContinuity: {
    id: "identity-continuity",
    personaId: "scenario-user-identity",
    workspaceId: "workspace-identity",
    sessions: [
      {
        sessionId: "identity-s1",
        turns: [
          { role: "user", content: "My name is Lin." },
          { role: "assistant", content: "Understood." },
          {
            role: "user",
            content: "Remember that I am a robotics engineer in Shanghai leading the migration rollout.",
          },
          { role: "assistant", content: "Noted." },
        ],
      },
      {
        sessionId: "identity-s2",
        turns: [
          {
            role: "user",
            content: "I prefer concise bullet points.",
          },
          { role: "assistant", content: "Will do." },
        ],
      },
    ],
    prompt: "Before we continue the migration rollout, confirm my role and preferred response style.",
    expectedRemembered: [
      {
        collection: "profiles",
        includes: "Lin",
      },
      {
        collection: "facts",
        includes: "robotics engineer in Shanghai leading the migration rollout",
        scope: { workspaceId: "workspace-identity" },
      },
      {
        collection: "preferences",
        includes: "concise bullet points",
        scope: { workspaceId: "workspace-identity" },
      },
    ],
    expectedRecalled: [
      {
        collection: "profile",
        includes: "Lin",
      },
      {
        collection: "facts",
        includes: "robotics engineer in Shanghai",
      },
      {
        collection: "preferences",
        includes: "concise bullet points",
      },
    ],
    expectedContextSnippets: [
      "Lin",
      "robotics engineer in Shanghai leading the migration rollout",
      "concise bullet points",
    ],
    expectedAnswer: {
      includes: [
        "Lin",
        "robotics engineer in Shanghai leading the migration rollout",
        "concise bullet points",
      ],
    },
  },
  openLoopContinuation: {
    id: "open-loop-continuation",
    personaId: "scenario-user-open-loop",
    workspaceId: "workspace-open-loop",
    sessions: [
      {
        sessionId: "loop-s1",
        turns: [
          {
            role: "user",
            content: "Remember that the robot rollout is blocked on step 2 of the migration runbook.",
          },
          { role: "assistant", content: "Captured." },
        ],
      },
      {
        sessionId: "loop-s2",
        turns: [
          {
            role: "user",
            content: "Remember that the remaining open loop is final verification for the robot rollout.",
          },
          { role: "assistant", content: "I will continue from there." },
        ],
      },
    ],
    prompt: "What open loop should we continue for the robot rollout?",
    expectedRemembered: [
      {
        collection: "facts",
        includes: "blocked on step 2 of the migration runbook",
        scope: { workspaceId: "workspace-open-loop" },
      },
      {
        collection: "facts",
        includes: "remaining open loop is final verification for the robot rollout",
        scope: { workspaceId: "workspace-open-loop" },
      },
    ],
    expectedRecalled: [
      {
        collection: "facts",
        includes: "final verification for the robot rollout",
      },
    ],
    expectedContextSnippets: [
      "final verification for the robot rollout",
    ],
    expectedAnswer: {
      includes: [
        "final verification for the robot rollout",
      ],
    },
  },
  staleReferenceCorrection: {
    id: "stale-reference-correction",
    personaId: "scenario-user-reference",
    workspaceId: "workspace-reference",
    sessions: [
      {
        sessionId: "ref-s1",
        turns: [
          {
            role: "user",
            content: "Use docs/migration-runbook-v1.md as the source of truth for migration work.",
          },
          { role: "assistant", content: "Okay." },
        ],
      },
      {
        sessionId: "ref-s2",
        turns: [
          {
            role: "user",
            content: "Correction: docs/migration-runbook-v2.md is now the source of truth, not docs/migration-runbook-v1.md. Please update that.",
          },
          { role: "assistant", content: "Updated." },
        ],
      },
    ],
    prompt: "Which runbook is the current source of truth for migration work?",
    expectedRemembered: [
      {
        collection: "references",
        includes: "docs/migration-runbook-v1.md",
        lifecycle: "superseded",
        scope: { workspaceId: "workspace-reference" },
      },
      {
        collection: "references",
        includes: "docs/migration-runbook-v2.md",
        lifecycle: "active",
        scope: { workspaceId: "workspace-reference" },
      },
    ],
    expectedRecalled: [
      {
        collection: "references",
        includes: "docs/migration-runbook-v2.md",
      },
    ],
    expectedContextSnippets: [
      "docs/migration-runbook-v2.md",
    ],
    forbiddenContextSnippets: [
      "docs/migration-runbook-v1.md",
    ],
    expectedAnswer: {
      includes: [
        "docs/migration-runbook-v2.md",
      ],
      excludes: [
        "docs/migration-runbook-v1.md",
      ],
    },
  },
  confirmationFeedback: {
    id: "confirmation-feedback",
    personaId: "scenario-user-feedback",
    workspaceId: "workspace-feedback",
    sessions: [
      {
        sessionId: "feedback-s1",
        turns: [
          {
            role: "user",
            content: "Please keep answers concise and action-oriented.",
          },
          { role: "assistant", content: "Understood." },
        ],
      },
      {
        sessionId: "feedback-s2",
        turns: [
          {
            role: "user",
            content: "That concise bullet-point summary worked well.",
          },
          { role: "assistant", content: "I will keep it." },
        ],
      },
    ],
    feedbackSignals: [
      {
        sessionId: "feedback-s2",
        signal: "The concise bullet-point summary worked well. Keep using that format.",
      },
    ],
    prompt: "How should you format the next status update for me?",
    expectedRemembered: [
      {
        collection: "feedback",
        includes: "concise and action oriented",
        scope: { workspaceId: "workspace-feedback" },
      },
      {
        collection: "feedback",
        includes: "concise bullet point summary worked well",
        scope: { workspaceId: "workspace-feedback" },
      },
    ],
    expectedRecalled: [
      {
        collection: "feedback",
        includes: "concise",
      },
    ],
    expectedContextSnippets: [
      "concise",
      "bullet point",
    ],
    expectedAnswer: {
      includes: [
        "concise",
        "bullet point",
      ],
    },
  },
  longLifecycleChange: {
    id: "long-lifecycle-change",
    personaId: "scenario-user-long",
    workspaceId: "workspace-long",
    sessions: [
      {
        sessionId: "long-s1",
        turns: [
          {
            role: "user",
            content: "Remember that I am a frontend engineer shipping the design system.",
          },
          { role: "assistant", content: "Noted." },
        ],
      },
      {
        sessionId: "long-s2",
        turns: [
          {
            role: "user",
            content: "Remember that my long-term goal is to move into platform engineering leadership.",
          },
          { role: "assistant", content: "Captured." },
        ],
      },
      {
        sessionId: "long-s3",
        turns: [
          {
            role: "user",
            content: "Remember that I am still migrating shared components into the design system.",
          },
          { role: "assistant", content: "Okay." },
        ],
      },
      {
        sessionId: "long-s4",
        turns: [
          {
            role: "user",
            content: "Remember that I have now moved into a staff platform engineer role leading runtime reliability.",
          },
          { role: "assistant", content: "Updated." },
        ],
      },
      {
        sessionId: "long-s5",
        turns: [
          {
            role: "user",
            content: "Remember that my current focus is runtime reliability and platform migration, not the old component backlog.",
          },
          { role: "assistant", content: "Understood." },
        ],
      },
    ],
    prompt: "Confirm my current role and focus before we continue the platform migration.",
    expectedRemembered: [
      {
        collection: "facts",
        includes: "frontend engineer shipping the design system",
        scope: { workspaceId: "workspace-long" },
      },
      {
        collection: "facts",
        includes: "staff platform engineer role leading runtime reliability",
        scope: { workspaceId: "workspace-long" },
      },
      {
        collection: "facts",
        includes: "current focus is runtime reliability and platform migration",
        scope: { workspaceId: "workspace-long" },
      },
    ],
    expectedRecalled: [
      {
        collection: "facts",
        includes: "staff platform engineer role leading runtime reliability",
      },
      {
        collection: "facts",
        includes: "current focus is runtime reliability and platform migration",
      },
    ],
    expectedContextSnippets: [
      "staff platform engineer role leading runtime reliability",
      "current focus is runtime reliability and platform migration",
    ],
    forbiddenContextSnippets: [
      "frontend engineer shipping the design system",
    ],
    expectedAnswer: {
      includes: [
        "staff platform engineer role leading runtime reliability",
        "current focus is runtime reliability and platform migration",
      ],
      excludes: [
        "frontend engineer shipping the design system",
      ],
    },
  },
  scopeIsolation: {
    id: "scope-isolation",
    personaId: "scenario-user-scope",
    sessions: [
      {
        sessionId: "scope-s1",
        scope: { workspaceId: "workspace-a" },
        turns: [
          {
            role: "user",
            content: "Use docs/payments-runbook.md as the source of truth for payments work.",
          },
          { role: "assistant", content: "Captured." },
        ],
      },
      {
        sessionId: "scope-s2",
        scope: { workspaceId: "workspace-b" },
        turns: [
          {
            role: "user",
            content: "Use docs/runtime-runbook.md as the source of truth for runtime work.",
          },
          { role: "assistant", content: "Captured." },
        ],
      },
    ],
    prompt: "Which runbook should you use for runtime work?",
    finalScope: {
      sessionId: "scope-s2",
      workspaceId: "workspace-b",
    },
    expectedRemembered: [
      {
        collection: "references",
        includes: "docs/payments-runbook.md",
        lifecycle: "active",
        scope: { workspaceId: "workspace-a" },
      },
      {
        collection: "references",
        includes: "docs/runtime-runbook.md",
        lifecycle: "active",
        scope: { workspaceId: "workspace-b" },
      },
    ],
    expectedRecalled: [
      {
        collection: "references",
        includes: "docs/runtime-runbook.md",
      },
    ],
    expectedContextSnippets: [
      "docs/runtime-runbook.md",
    ],
    forbiddenContextSnippets: [
      "docs/payments-runbook.md",
    ],
    expectedAnswer: {
      includes: [
        "docs/runtime-runbook.md",
      ],
      excludes: [
        "docs/payments-runbook.md",
      ],
    },
  },
};
