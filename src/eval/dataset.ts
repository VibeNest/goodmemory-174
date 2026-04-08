import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { loadJsonFixture } from "../testing/fixtures";

export type PersonaLifecycleBucket = "medium" | "complex" | "long";
export type ScenarioEvaluationSetting = "single_domain" | "cross_domain";
export type PersonalizationTaskFamily =
  | "preference_continuation"
  | "cross_domain_transfer"
  | "cross_domain_suppression"
  | "drift_override_lifelong_update";

export type ScenarioPhenomenon =
  | "identity_reveal"
  | "historical_task_continuation"
  | "open_loop"
  | "correction"
  | "confirmation"
  | "stale_info";

export interface PersonaSpec {
  persona_id: string;
  name: string;
  age_range: string;
  locale: string;
  profession: string;
  expertise: string[];
  background: string;
  communication_preferences: string[];
  work_style_preferences: string[];
  long_term_goals: string[];
  current_projects: string[];
  growth_path: string[];
  known_relationships: string[];
  memory_risks: string[];
  domains: string[];
  stable_preferences: string[];
  domain_specific_preferences: string[];
  drift_events: string[];
  negative_personalization_risks: string[];
  lifecycle_bucket: PersonaLifecycleBucket;
  scenario_ids: string[];
}

export interface ScenarioTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ScenarioSession {
  session_id: string;
  objective: string;
  turns: ScenarioTurn[];
}

export interface ScenarioFeedbackSignal {
  session_id: string;
  signal: string;
}

export interface ScenarioEvaluationSpec {
  prompt: string;
  rubric_focus: Array<"identity_background" | "history_open_loop">;
  expected_identity_signals: string[];
  expected_history_signals: string[];
  expected_transfer_signals: string[];
  expected_non_transfer_signals: string[];
  expected_update_wins: string[];
  expected_stale_suppression: string[];
  wrong_personalization_signals: string[];
  improvement_hypothesis: string;
  user_satisfaction_hypothesis: string;
}

export interface ScenarioFixture {
  scenario_id: string;
  persona_id: string;
  lifecycle_bucket: PersonaLifecycleBucket;
  task_family: PersonalizationTaskFamily;
  domain: string;
  memory_source_domains: string[];
  evaluation_setting: ScenarioEvaluationSetting;
  required_phenomena: ScenarioPhenomenon[];
  sessions: ScenarioSession[];
  feedback_signals?: ScenarioFeedbackSignal[];
  evaluation: ScenarioEvaluationSpec;
}

export interface PersonaDatasetRules {
  total: number;
  lifecycleBuckets: Record<PersonaLifecycleBucket, number>;
}

export const DEFAULT_PERSONA_DATASET_RULES: PersonaDatasetRules = {
  total: 40,
  lifecycleBuckets: {
    medium: 28,
    complex: 8,
    long: 4,
  },
};

const REQUIRED_PHENOMENA: ScenarioPhenomenon[] = [
  "confirmation",
  "correction",
  "historical_task_continuation",
  "identity_reveal",
  "open_loop",
  "stale_info",
];

const SCENARIO_LIFECYCLE_RULES: Record<
  PersonaLifecycleBucket,
  {
    minSessions: number;
    maxSessions: number;
    minTurns: number;
    maxTurns: number;
  }
> = {
  medium: {
    minSessions: 3,
    maxSessions: 4,
    minTurns: 8,
    maxTurns: 15,
  },
  complex: {
    minSessions: 4,
    maxSessions: 5,
    minTurns: 12,
    maxTurns: 24,
  },
  long: {
    minSessions: 5,
    maxSessions: 8,
    minTurns: 20,
    maxTurns: 40,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }

  return value;
}

function assertStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${path} must be a non-empty string array`);
  }

  return value.map((entry, index) => assertString(entry, `${path}[${index}]`));
}

function assertLifecycleBucket(value: unknown, path: string): PersonaLifecycleBucket {
  if (value === "medium" || value === "complex" || value === "long") {
    return value;
  }

  throw new Error(`${path} must be one of medium, complex, long`);
}

function assertPhenomena(value: unknown, path: string): ScenarioPhenomenon[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${path} must be a non-empty phenomenon array`);
  }

  return value.map((entry, index) => {
    const phenomenon = assertString(entry, `${path}[${index}]`);
    if (!REQUIRED_PHENOMENA.includes(phenomenon as ScenarioPhenomenon)) {
      throw new Error(`${path}[${index}] is not a supported phenomenon`);
    }
    return phenomenon as ScenarioPhenomenon;
  });
}

export function validatePersonaSpec(input: unknown): PersonaSpec {
  if (!isRecord(input)) {
    throw new Error("persona fixture must be an object");
  }

  return {
    persona_id: assertString(input.persona_id, "persona_id"),
    name: assertString(input.name, "name"),
    age_range: assertString(input.age_range, "age_range"),
    locale: assertString(input.locale, "locale"),
    profession: assertString(input.profession, "profession"),
    expertise: assertStringArray(input.expertise, "expertise"),
    background: assertString(input.background, "background"),
    communication_preferences: assertStringArray(
      input.communication_preferences,
      "communication_preferences",
    ),
    work_style_preferences: assertStringArray(
      input.work_style_preferences,
      "work_style_preferences",
    ),
    long_term_goals: assertStringArray(input.long_term_goals, "long_term_goals"),
    current_projects: assertStringArray(input.current_projects, "current_projects"),
    growth_path: assertStringArray(input.growth_path, "growth_path"),
    known_relationships: assertStringArray(
      input.known_relationships,
      "known_relationships",
    ),
    memory_risks: assertStringArray(input.memory_risks, "memory_risks"),
    domains: assertStringArray(input.domains, "domains"),
    stable_preferences: assertStringArray(
      input.stable_preferences,
      "stable_preferences",
    ),
    domain_specific_preferences: assertStringArray(
      input.domain_specific_preferences,
      "domain_specific_preferences",
    ),
    drift_events: assertStringArray(input.drift_events, "drift_events"),
    negative_personalization_risks: assertStringArray(
      input.negative_personalization_risks,
      "negative_personalization_risks",
    ),
    lifecycle_bucket: assertLifecycleBucket(
      input.lifecycle_bucket,
      "lifecycle_bucket",
    ),
    scenario_ids: assertStringArray(input.scenario_ids, "scenario_ids"),
  };
}

function validateScenarioTurn(input: unknown, path: string): ScenarioTurn {
  if (!isRecord(input)) {
    throw new Error(`${path} must be an object`);
  }

  const role = assertString(input.role, `${path}.role`);
  if (role !== "user" && role !== "assistant") {
    throw new Error(`${path}.role must be user or assistant`);
  }

  return {
    role,
    content: assertString(input.content, `${path}.content`),
  };
}

function validateScenarioSession(input: unknown, path: string): ScenarioSession {
  if (!isRecord(input)) {
    throw new Error(`${path} must be an object`);
  }

  const turnsValue = input.turns;
  if (!Array.isArray(turnsValue) || turnsValue.length < 2) {
    throw new Error(`${path}.turns must contain at least two turns`);
  }

  return {
    session_id: assertString(input.session_id, `${path}.session_id`),
    objective: assertString(input.objective, `${path}.objective`),
    turns: turnsValue.map((turn, index) =>
      validateScenarioTurn(turn, `${path}.turns[${index}]`),
    ),
  };
}

function validateScenarioEvaluation(
  input: unknown,
  path: string,
): ScenarioEvaluationSpec {
  if (!isRecord(input)) {
    throw new Error(`${path} must be an object`);
  }

  const rubricFocus = assertStringArray(input.rubric_focus, `${path}.rubric_focus`);
  const normalizedRubricFocus = rubricFocus.map((entry, index) => {
    if (entry !== "identity_background" && entry !== "history_open_loop") {
      throw new Error(`${path}.rubric_focus[${index}] is invalid`);
    }
    return entry;
  }) as Array<"identity_background" | "history_open_loop">;

  return {
    prompt: assertString(input.prompt, `${path}.prompt`),
    rubric_focus: normalizedRubricFocus,
    expected_identity_signals: assertStringArray(
      input.expected_identity_signals,
      `${path}.expected_identity_signals`,
    ),
    expected_history_signals: assertStringArray(
      input.expected_history_signals,
      `${path}.expected_history_signals`,
    ),
    expected_transfer_signals: assertStringArray(
      input.expected_transfer_signals,
      `${path}.expected_transfer_signals`,
    ),
    expected_non_transfer_signals: assertStringArray(
      input.expected_non_transfer_signals,
      `${path}.expected_non_transfer_signals`,
    ),
    expected_update_wins: assertStringArray(
      input.expected_update_wins,
      `${path}.expected_update_wins`,
    ),
    expected_stale_suppression: assertStringArray(
      input.expected_stale_suppression,
      `${path}.expected_stale_suppression`,
    ),
    wrong_personalization_signals: assertStringArray(
      input.wrong_personalization_signals,
      `${path}.wrong_personalization_signals`,
    ),
    improvement_hypothesis: assertString(
      input.improvement_hypothesis,
      `${path}.improvement_hypothesis`,
    ),
    user_satisfaction_hypothesis: assertString(
      input.user_satisfaction_hypothesis,
      `${path}.user_satisfaction_hypothesis`,
    ),
  };
}

function assertScenarioEvaluationSetting(
  value: unknown,
  path: string,
): ScenarioEvaluationSetting {
  if (value === "single_domain" || value === "cross_domain") {
    return value;
  }

  throw new Error(`${path} must be single_domain or cross_domain`);
}

function assertTaskFamily(
  value: unknown,
  path: string,
): PersonalizationTaskFamily {
  if (
    value === "preference_continuation" ||
    value === "cross_domain_transfer" ||
    value === "cross_domain_suppression" ||
    value === "drift_override_lifelong_update"
  ) {
    return value;
  }

  throw new Error(
    `${path} must be one of preference_continuation, cross_domain_transfer, cross_domain_suppression, drift_override_lifelong_update`,
  );
}

function validateFeedbackSignals(
  input: unknown,
  path: string,
  sessions: ScenarioSession[],
): ScenarioFeedbackSignal[] | undefined {
  if (input === undefined) {
    return undefined;
  }

  if (!Array.isArray(input)) {
    throw new Error(`${path} must be an array when present`);
  }

  const sessionIds = new Set(sessions.map((session) => session.session_id));

  return input.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`${path}[${index}] must be an object`);
    }

    const sessionId = assertString(entry.session_id, `${path}[${index}].session_id`);
    if (!sessionIds.has(sessionId)) {
      throw new Error(`${path}[${index}].session_id must reference a known session`);
    }

    return {
      session_id: sessionId,
      signal: assertString(entry.signal, `${path}[${index}].signal`),
    };
  });
}

function countScenarioTurns(sessions: ScenarioSession[]): number {
  return sessions.reduce((sum, session) => sum + session.turns.length, 0);
}

function validateScenarioLifecycleRichness(
  lifecycleBucket: PersonaLifecycleBucket,
  sessions: ScenarioSession[],
): void {
  const rules = SCENARIO_LIFECYCLE_RULES[lifecycleBucket];
  const totalTurns = countScenarioTurns(sessions);

  if (
    sessions.length < rules.minSessions ||
    sessions.length > rules.maxSessions
  ) {
    throw new Error(
      `${lifecycleBucket} scenarios must contain ${rules.minSessions}-${rules.maxSessions} sessions`,
    );
  }

  if (totalTurns < rules.minTurns || totalTurns > rules.maxTurns) {
    throw new Error(
      `${lifecycleBucket} scenarios must contain ${rules.minTurns}-${rules.maxTurns} turns`,
    );
  }
}

export function validateScenarioFixture(input: unknown): ScenarioFixture {
  if (!isRecord(input)) {
    throw new Error("scenario fixture must be an object");
  }

  const lifecycleBucket = assertLifecycleBucket(
    input.lifecycle_bucket,
    "lifecycle_bucket",
  );

  const sessionsValue = input.sessions;
  if (!Array.isArray(sessionsValue)) {
    throw new Error("sessions must be an array");
  }

  const requiredPhenomena = assertPhenomena(
    input.required_phenomena,
    "required_phenomena",
  );

  for (const phenomenon of REQUIRED_PHENOMENA) {
    if (!requiredPhenomena.includes(phenomenon)) {
      throw new Error(`required_phenomena must include ${phenomenon}`);
    }
  }

  const sessions = sessionsValue.map((session, index) =>
    validateScenarioSession(session, `sessions[${index}]`),
  );
  validateScenarioLifecycleRichness(lifecycleBucket, sessions);

  return {
    scenario_id: assertString(input.scenario_id, "scenario_id"),
    persona_id: assertString(input.persona_id, "persona_id"),
    lifecycle_bucket: lifecycleBucket,
    task_family: assertTaskFamily(input.task_family, "task_family"),
    domain: assertString(input.domain, "domain"),
    memory_source_domains: assertStringArray(
      input.memory_source_domains,
      "memory_source_domains",
    ),
    evaluation_setting: assertScenarioEvaluationSetting(
      input.evaluation_setting,
      "evaluation_setting",
    ),
    required_phenomena: requiredPhenomena,
    sessions,
    feedback_signals: validateFeedbackSignals(
      input.feedback_signals,
      "feedback_signals",
      sessions,
    ),
    evaluation: validateScenarioEvaluation(input.evaluation, "evaluation"),
  };
}

async function listJsonFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(dir, entry.name))
    .sort();
}

export async function loadPersonaSpec(path: string): Promise<PersonaSpec> {
  try {
    const fixture = await loadJsonFixture<unknown>(path);
    return validatePersonaSpec(fixture);
  } catch (error) {
    throw new Error(
      `Invalid persona fixture at ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function loadScenarioFixture(path: string): Promise<ScenarioFixture> {
  try {
    const fixture = await loadJsonFixture<unknown>(path);
    return validateScenarioFixture(fixture);
  } catch (error) {
    throw new Error(
      `Invalid scenario fixture at ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function listPersonaSpecs(dir: string): Promise<PersonaSpec[]> {
  const files = await listJsonFiles(dir);
  return Promise.all(files.map((path) => loadPersonaSpec(path)));
}

export async function listScenarioFixtures(dir: string): Promise<ScenarioFixture[]> {
  const files = await listJsonFiles(dir);
  return Promise.all(files.map((path) => loadScenarioFixture(path)));
}

export function summarizePersonaDataset(personas: PersonaSpec[]) {
  return {
    total: personas.length,
    coveredDomains: Array.from(new Set(personas.flatMap((persona) => persona.domains))).sort(),
    lifecycleBuckets: personas.reduce<Record<PersonaLifecycleBucket, number>>(
      (counts, persona) => {
        counts[persona.lifecycle_bucket] += 1;
        return counts;
      },
      { medium: 0, complex: 0, long: 0 },
    ),
  };
}

export function validatePersonaDatasetCoverage(
  personas: PersonaSpec[],
  rules: PersonaDatasetRules,
): void {
  const summary = summarizePersonaDataset(personas);
  if (summary.total < rules.total) {
    throw new Error(
      `persona dataset must contain at least ${rules.total} personas`,
    );
  }

  for (const bucket of Object.keys(rules.lifecycleBuckets) as PersonaLifecycleBucket[]) {
    if (summary.lifecycleBuckets[bucket] < rules.lifecycleBuckets[bucket]) {
      throw new Error(
        `persona dataset must contain at least ${rules.lifecycleBuckets[bucket]} ${bucket} personas`,
      );
    }
  }
}

export function summarizeScenarioDataset(scenarios: ScenarioFixture[]) {
  const coveredPhenomena = Array.from(
    new Set(
      scenarios.flatMap((scenario) => scenario.required_phenomena),
    ),
  ).sort() as ScenarioPhenomenon[];

  return {
    total: scenarios.length,
    coveredPhenomena,
    coveredTaskFamilies: Array.from(
      new Set(scenarios.map((scenario) => scenario.task_family)),
    ).sort() as PersonalizationTaskFamily[],
    coveredEvaluationSettings: Array.from(
      new Set(scenarios.map((scenario) => scenario.evaluation_setting)),
    ).sort() as ScenarioEvaluationSetting[],
    coveredDomains: Array.from(
      new Set(scenarios.flatMap((scenario) => [scenario.domain, ...scenario.memory_source_domains])),
    ).sort(),
  };
}

export function validateScenarioDatasetLinks(
  personas: PersonaSpec[],
  scenarios: ScenarioFixture[],
): void {
  const personasById = new Map(personas.map((persona) => [persona.persona_id, persona]));
  const scenariosById = new Map(scenarios.map((scenario) => [scenario.scenario_id, scenario]));

  for (const scenario of scenarios) {
    const persona = personasById.get(scenario.persona_id);
    if (!persona) {
      throw new Error(
        `scenario ${scenario.scenario_id} references unknown persona ${scenario.persona_id}`,
      );
    }

    if (!persona.domains.includes(scenario.domain)) {
      throw new Error(
        `scenario ${scenario.scenario_id} domain ${scenario.domain} must exist in persona ${persona.persona_id}.domains`,
      );
    }

    for (const sourceDomain of scenario.memory_source_domains) {
      if (!persona.domains.includes(sourceDomain)) {
        throw new Error(
          `scenario ${scenario.scenario_id} memory source domain ${sourceDomain} must exist in persona ${persona.persona_id}.domains`,
        );
      }
    }
  }

  for (const persona of personas) {
    if (persona.scenario_ids.length === 0) {
      throw new Error(`persona ${persona.persona_id} must reference at least one scenario`);
    }

    for (const scenarioId of persona.scenario_ids) {
      const scenario = scenariosById.get(scenarioId);
      if (!scenario) {
        throw new Error(
          `persona ${persona.persona_id} references missing scenario ${scenarioId}`,
        );
      }

      if (scenario.persona_id !== persona.persona_id) {
        throw new Error(
          `scenario ${scenarioId} is linked to ${scenario.persona_id}, expected ${persona.persona_id}`,
        );
      }
    }
  }
}
