import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  PersonaLifecycleBucket,
  PersonaSpec,
  ScenarioFixture,
} from "../src/eval/dataset";

const ROOT = new URL("..", import.meta.url).pathname;
const PERSONA_DIR = join(ROOT, "fixtures/personas/eval");
const SCENARIO_DIR = join(ROOT, "fixtures/scenarios/eval");

const NAMES = [
  "Lin", "Maya", "Ethan", "Sofia", "Haruto", "Amina", "Jonas", "Nadia", "Leo", "Iris",
  "Arjun", "Clara", "Noah", "Yuna", "Mateo", "Zoe", "Omar", "Elena", "Kai", "Rin",
  "Tara", "Miles", "Hana", "Diego", "Lena", "Anika", "Hugo", "Mina", "Felix", "Sana",
  "Theo", "June", "Idris", "Mei", "Pavel", "Nora", "Adrian", "Yara", "Dylan", "Celine",
];

const LOCALES = [
  "Shanghai, China",
  "Hangzhou, China",
  "Singapore",
  "Tokyo, Japan",
  "Seoul, South Korea",
  "Berlin, Germany",
  "London, UK",
  "Toronto, Canada",
  "Austin, USA",
  "Sydney, Australia",
];

const PROFESSIONS = [
  "Robotics engineer",
  "Product manager",
  "Data scientist",
  "Frontend engineer",
  "Security analyst",
  "DevOps lead",
  "Biomedical researcher",
  "Game designer",
  "Climate policy advisor",
  "Operations manager",
];

const EXPERTISE_SETS = [
  ["distributed systems", "release engineering"],
  ["product strategy", "user research"],
  ["forecasting", "experimentation"],
  ["design systems", "typescript"],
  ["incident response", "compliance"],
  ["kubernetes", "platform tooling"],
  ["clinical workflows", "evidence synthesis"],
  ["narrative design", "live-ops"],
  ["energy systems", "policy modeling"],
  ["vendor operations", "process redesign"],
];

const COMMUNICATION_PREFERENCES = [
  ["concise bullet points", "clear next steps"],
  ["risk-first summaries", "explicit assumptions"],
  ["structured outlines", "plain language"],
  ["short status updates", "decision tables"],
];

const WORK_STYLE_PREFERENCES = [
  ["incremental delivery", "visible checklists"],
  ["deep work blocks", "written decisions"],
  ["prototype before polish", "tight feedback loops"],
  ["evidence-backed recommendations", "traceable rationale"],
];

const PROJECTS = [
  "migration rollout",
  "agent memory evaluation suite",
  "workflow reliability dashboard",
  "tooling consolidation initiative",
  "customer support copilot",
  "research operations redesign",
  "release quality program",
  "cross-team API cleanup",
  "incident playbook refresh",
  "knowledge base overhaul",
];

const GOALS = [
  "become a stronger technical leader",
  "build a dependable AI workflow",
  "reduce operational noise across teams",
  "ship a reusable platform capability",
  "improve delegation and follow-through",
];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function projectSlug(project: string): string {
  return project.replace(/\s+/g, "-");
}

function createPersona(
  bucket: PersonaLifecycleBucket,
  index: number,
  variationIndex: number,
): PersonaSpec {
  const name = NAMES[variationIndex % NAMES.length]!;
  const locale = LOCALES[variationIndex % LOCALES.length]!;
  const profession = PROFESSIONS[variationIndex % PROFESSIONS.length]!;
  const expertise = EXPERTISE_SETS[variationIndex % EXPERTISE_SETS.length]!;
  const communicationPreferences =
    COMMUNICATION_PREFERENCES[variationIndex % COMMUNICATION_PREFERENCES.length]!;
  const workStylePreferences =
    WORK_STYLE_PREFERENCES[variationIndex % WORK_STYLE_PREFERENCES.length]!;
  const project = PROJECTS[variationIndex % PROJECTS.length]!;
  const goal = GOALS[variationIndex % GOALS.length]!;
  const personaId = `${bucket}-${pad(index)}`;

  return {
    persona_id: personaId,
    name,
    age_range: bucket === "long" ? "40-55" : bucket === "complex" ? "32-45" : "25-38",
    locale,
    profession,
    expertise,
    background: `${name} is a ${profession.toLowerCase()} in ${locale} working on ${project}.`,
    communication_preferences: communicationPreferences,
    work_style_preferences: workStylePreferences,
    long_term_goals: [goal],
    current_projects: [project],
    growth_path: [
      `Started by stabilizing ${project}.`,
      `Now trying to scale the lessons from ${project} into team-wide practice.`,
    ],
    known_relationships: [
      `Works closely with a manager on ${project}.`,
      `Coordinates with a cross-functional peer group in ${locale}.`,
    ],
    memory_risks: [
      `Project details for ${project} may drift across sessions.`,
      "User may correct outdated runbook or status information.",
    ],
    lifecycle_bucket: bucket,
    scenario_ids: [`scenario-${personaId}`],
  };
}

function createMediumScenario(persona: PersonaSpec): ScenarioFixture {
  const project = persona.current_projects[0]!;
  const referencePointer = `docs/${projectSlug(project)}-runbook-v2.md`;
  const stalePointer = `docs/${projectSlug(project)}-runbook-v1.md`;
  const openLoop = `final verification for ${project}`;

  return {
    scenario_id: `scenario-${persona.persona_id}`,
    persona_id: persona.persona_id,
    lifecycle_bucket: persona.lifecycle_bucket,
    required_phenomena: [
      "identity_reveal",
      "historical_task_continuation",
      "open_loop",
      "correction",
      "confirmation",
      "stale_info",
    ],
    sessions: [
      {
        session_id: `${persona.persona_id}-s1`,
        objective: "Reveal identity, project context, and response preferences.",
        turns: [
          {
            role: "user",
            content: `My name is ${persona.name}. I'm a ${persona.profession.toLowerCase()} in ${persona.locale}. Remember that I'm leading ${project}.`,
          },
          {
            role: "assistant",
            content: "Noted. I will keep that background in mind.",
          },
          {
            role: "user",
            content: `I prefer ${persona.communication_preferences[0]} and ${persona.work_style_preferences[0]}.`,
          },
          {
            role: "assistant",
            content: "Understood. I will respond in that style.",
          },
        ],
      },
      {
        session_id: `${persona.persona_id}-s2`,
        objective: "Introduce a canonical reference and leave an open loop.",
        turns: [
          {
            role: "user",
            content: `Use ${stalePointer} as the source of truth for ${project} for now.`,
          },
          {
            role: "assistant",
            content: "Okay. I will use that runbook as the current reference.",
          },
          {
            role: "user",
            content: `We paused after step 2 and still have an open loop on ${openLoop}. Continue from there next time.`,
          },
          {
            role: "assistant",
            content: "Captured. I will continue from that open loop later.",
          },
        ],
      },
      {
        session_id: `${persona.persona_id}-s3`,
        objective: "Correct stale information and ask for a memory-dependent answer.",
        turns: [
          {
            role: "user",
            content: `Correction: ${referencePointer} is now the source of truth, not ${stalePointer}. Please update that.`,
          },
          {
            role: "assistant",
            content: "Updated. I will use the newer runbook going forward.",
          },
          {
            role: "user",
            content: `Please confirm the updated runbook, my role, and the open loop before proposing the next step for ${project}.`,
          },
          {
            role: "assistant",
            content: "I can do that once I have the full remembered context.",
          },
        ],
      },
    ],
    feedback_signals: [
      {
        session_id: `${persona.persona_id}-s1`,
        signal: `The ${persona.communication_preferences[0]} format worked well. Keep using that style.`,
      },
    ],
    evaluation: {
      prompt: `Please confirm the updated runbook, my role, and the open loop before proposing the next step for ${project}.`,
      rubric_focus: ["identity_background", "history_open_loop"],
      expected_identity_signals: [
        persona.profession,
        persona.locale,
        persona.communication_preferences[0]!,
      ],
      expected_history_signals: [
        referencePointer,
        openLoop,
        project,
      ],
      improvement_hypothesis:
        "GoodMemory should beat baseline by recovering the user's role, corrected runbook, and open loop without asking for repeated context.",
    },
  };
}

function createComplexScenario(persona: PersonaSpec): ScenarioFixture {
  const project = persona.current_projects[0]!;
  const referencePointer = `docs/${projectSlug(project)}-runbook-v2.md`;
  const stalePointer = `docs/${projectSlug(project)}-runbook-v1.md`;
  const openLoop = `handoff package for ${project}`;
  const blocker = `vendor approval for ${project}`;

  return {
    scenario_id: `scenario-${persona.persona_id}`,
    persona_id: persona.persona_id,
    lifecycle_bucket: persona.lifecycle_bucket,
    required_phenomena: [
      "identity_reveal",
      "historical_task_continuation",
      "open_loop",
      "correction",
      "confirmation",
      "stale_info",
    ],
    sessions: [
      {
        session_id: `${persona.persona_id}-s1`,
        objective: "Reveal identity, project context, and working style.",
        turns: [
          {
            role: "user",
            content: `My name is ${persona.name}. I'm a ${persona.profession.toLowerCase()} in ${persona.locale}. Remember that I'm leading ${project}.`,
          },
          {
            role: "assistant",
            content: "Noted. I will keep that background in mind.",
          },
          {
            role: "user",
            content: `I prefer ${persona.communication_preferences[0]} and ${persona.work_style_preferences[1]}.`,
          },
          {
            role: "assistant",
            content: "Understood. I will respond in that style.",
          },
        ],
      },
      {
        session_id: `${persona.persona_id}-s2`,
        objective: "Introduce a stale reference and an unresolved blocker.",
        turns: [
          {
            role: "user",
            content: `Use ${stalePointer} as the source of truth for ${project} until further notice.`,
          },
          {
            role: "assistant",
            content: "Okay. I will use that runbook for now.",
          },
          {
            role: "user",
            content: `Remember that the current blocker is ${blocker}.`,
          },
          {
            role: "assistant",
            content: "Captured. I will keep that blocker in mind.",
          },
        ],
      },
      {
        session_id: `${persona.persona_id}-s3`,
        objective: "Track the open loop and confirm the preferred reporting format.",
        turns: [
          {
            role: "user",
            content: `Remember that the open loop is the ${openLoop}.`,
          },
          {
            role: "assistant",
            content: "I will continue from that open loop.",
          },
          {
            role: "user",
            content: `That ${persona.communication_preferences[0]} format worked well for the last status update.`,
          },
          {
            role: "assistant",
            content: "I will keep using it.",
          },
        ],
      },
      {
        session_id: `${persona.persona_id}-s4`,
        objective: "Correct stale information and request a memory-sensitive answer.",
        turns: [
          {
            role: "user",
            content: `Correction: ${referencePointer} is now the source of truth, not ${stalePointer}. Please update that.`,
          },
          {
            role: "assistant",
            content: "Updated. I will use the newer runbook going forward.",
          },
          {
            role: "user",
            content: `Please confirm the updated runbook, my role, the blocker, and the ${openLoop} before proposing the next step for ${project}.`,
          },
          {
            role: "assistant",
            content: "I can do that once I have the full remembered context.",
          },
        ],
      },
    ],
    feedback_signals: [
      {
        session_id: `${persona.persona_id}-s3`,
        signal: `The ${persona.communication_preferences[0]} format worked well. Keep using that for ${project}.`,
      },
    ],
    evaluation: {
      prompt: `Please confirm the updated runbook, my role, the blocker, and the ${openLoop} before proposing the next step for ${project}.`,
      rubric_focus: ["identity_background", "history_open_loop"],
      expected_identity_signals: [
        persona.profession,
        persona.locale,
        persona.communication_preferences[0]!,
      ],
      expected_history_signals: [
        referencePointer,
        blocker,
        openLoop,
        project,
      ],
      improvement_hypothesis:
        "GoodMemory should beat baseline by combining the corrected runbook, confirmed response style, active blocker, and unresolved open loop in one answer.",
    },
  };
}

function createLongScenario(persona: PersonaSpec): ScenarioFixture {
  const project = persona.current_projects[0]!;
  const referencePointer = `docs/${projectSlug(project)}-runbook-v2.md`;
  const stalePointer = `docs/${projectSlug(project)}-runbook-v1.md`;
  const openLoop = `final reliability signoff for ${project}`;
  const updatedRole = `staff platform engineer leading ${project}`;
  const currentFocus = `runtime reliability and platform migration for ${project}`;

  return {
    scenario_id: `scenario-${persona.persona_id}`,
    persona_id: persona.persona_id,
    lifecycle_bucket: persona.lifecycle_bucket,
    required_phenomena: [
      "identity_reveal",
      "historical_task_continuation",
      "open_loop",
      "correction",
      "confirmation",
      "stale_info",
    ],
    sessions: [
      {
        session_id: `${persona.persona_id}-s1`,
        objective: "Reveal identity and initial role.",
        turns: [
          {
            role: "user",
            content: `My name is ${persona.name}. Remember that I am a ${persona.profession.toLowerCase()} in ${persona.locale}.`,
          },
          {
            role: "assistant",
            content: "Noted. I will keep that background in mind.",
          },
          {
            role: "user",
            content: `Remember that I am leading ${project}.`,
          },
          {
            role: "assistant",
            content: "Captured.",
          },
        ],
      },
      {
        session_id: `${persona.persona_id}-s2`,
        objective: "Record style preference and stale reference.",
        turns: [
          {
            role: "user",
            content: `I prefer ${persona.communication_preferences[0]} and ${persona.work_style_preferences[0]}.`,
          },
          {
            role: "assistant",
            content: "Understood. I will respond in that style.",
          },
          {
            role: "user",
            content: `Use ${stalePointer} as the source of truth for ${project} for now.`,
          },
          {
            role: "assistant",
            content: "Okay. I will use that runbook for now.",
          },
        ],
      },
      {
        session_id: `${persona.persona_id}-s3`,
        objective: "Leave an open loop and state a future goal.",
        turns: [
          {
            role: "user",
            content: `Remember that my long-term goal is to move into platform engineering leadership.`,
          },
          {
            role: "assistant",
            content: "Captured.",
          },
          {
            role: "user",
            content: `Remember that the open loop is ${openLoop}.`,
          },
          {
            role: "assistant",
            content: "I will continue from there later.",
          },
        ],
      },
      {
        session_id: `${persona.persona_id}-s4`,
        objective: "Introduce a lifecycle change and new current focus.",
        turns: [
          {
            role: "user",
            content: `Remember that I have now moved into a ${updatedRole}.`,
          },
          {
            role: "assistant",
            content: "Updated.",
          },
          {
            role: "user",
            content: `Remember that my current focus is ${currentFocus}, not the old backlog cleanup.`,
          },
          {
            role: "assistant",
            content: "Understood.",
          },
        ],
      },
      {
        session_id: `${persona.persona_id}-s5`,
        objective: "Correct the stale reference and ask for a memory-dependent answer.",
        turns: [
          {
            role: "user",
            content: `Correction: ${referencePointer} is now the source of truth, not ${stalePointer}. Please update that.`,
          },
          {
            role: "assistant",
            content: "Updated. I will use the newer runbook going forward.",
          },
          {
            role: "user",
            content: `Please confirm my current role, my current focus, the updated runbook, and the ${openLoop} before proposing the next step for ${project}.`,
          },
          {
            role: "assistant",
            content: "I can do that once I have the full remembered context.",
          },
        ],
      },
    ],
    feedback_signals: [
      {
        session_id: `${persona.persona_id}-s2`,
        signal: `The ${persona.communication_preferences[0]} style works well for long-running updates. Keep using it.`,
      },
    ],
    evaluation: {
      prompt: `Please confirm my current role, my current focus, the updated runbook, and the ${openLoop} before proposing the next step for ${project}.`,
      rubric_focus: ["identity_background", "history_open_loop"],
      expected_identity_signals: [
        updatedRole,
        currentFocus,
        persona.communication_preferences[0]!,
      ],
      expected_history_signals: [
        referencePointer,
        openLoop,
        project,
      ],
      improvement_hypothesis:
        "GoodMemory should beat baseline by preferring the user's current role and focus, using the corrected runbook, and resuming the unresolved long-lived open loop.",
    },
  };
}

function createScenario(persona: PersonaSpec): ScenarioFixture {
  if (persona.lifecycle_bucket === "medium") {
    return createMediumScenario(persona);
  }

  if (persona.lifecycle_bucket === "complex") {
    return createComplexScenario(persona);
  }

  return createLongScenario(persona);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  await rm(PERSONA_DIR, { recursive: true, force: true });
  await rm(SCENARIO_DIR, { recursive: true, force: true });
  await mkdir(PERSONA_DIR, { recursive: true });
  await mkdir(SCENARIO_DIR, { recursive: true });

  const buckets: Array<[PersonaLifecycleBucket, number]> = [
    ["medium", 28],
    ["complex", 8],
    ["long", 4],
  ];

  let globalIndex = 0;
  for (const [bucket, count] of buckets) {
    for (let index = 1; index <= count; index += 1) {
      globalIndex += 1;
      const persona = createPersona(bucket, index, globalIndex - 1);
      const scenario = createScenario(persona);

      await writeJson(join(PERSONA_DIR, `${persona.persona_id}.json`), persona);
      await writeJson(join(SCENARIO_DIR, `${scenario.scenario_id}.json`), scenario);
    }
  }
}

if (import.meta.main) {
  await main();
}
