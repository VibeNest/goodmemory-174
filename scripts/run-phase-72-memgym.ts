import { createHash } from "node:crypto";
import {
  appendFile,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import { createGoodMemory } from "../src/api/createGoodMemory";
import type { GoodMemory, RecallResult } from "../src/api/contracts";
import type { MemoryScope } from "../src/domain/scope";
import {
  requestOpenAICompatibleObject,
  type AISDKModelConfig,
} from "../src/provider/ai-sdk-runtime";
import {
  assertCliPathSegmentValue,
  resolveCliFlagValueStrict,
} from "./cli-options";
import {
  PHASE72_ANSWER_GATEWAY,
  PHASE72_ANSWER_MODEL,
  PHASE72_INDEPENDENT_JUDGE_MODEL,
  PHASE72_UPSTREAMS,
} from "./phase-72-external-contracts";
import {
  evaluateMemGymComparison,
  type MemGymCaseResult,
  type MemGymFactDecision,
  type MemGymProfile,
  summarizeMemGymProfile,
} from "./phase-72-memgym";

const memGymGroundingFactSchema = z.object({
  content: z.string().min(1),
  id: z.string().min(1),
}).passthrough();

const memGymQAPairSchema = z.object({
  linked_fact_ids: z.array(z.string().min(1)).min(1),
  qa_id: z.string().min(1),
  question: z.string().min(1),
}).passthrough();

const memGymInstanceSchema = z.object({
  grounding_facts: z.array(memGymGroundingFactSchema).min(1),
  instance_id: z.string().min(1),
  memory_files: z.record(z.string(), z.string()),
  qa_pairs: z.array(memGymQAPairSchema).min(1),
  repo_context: z.string(),
  task_prompt: z.string().min(1),
}).passthrough();

const memGymAnswerSchema = z.object({
  answer: z.string().min(1),
  confidence: z.number().min(0).max(1),
  sources_used: z.array(z.string()),
});

const memGymFactJudgeSchema = z.object({
  confidence: z.number().min(0).max(1),
  contains_fact: z.boolean(),
  explanation: z.string(),
});

type MemGymInstance = z.infer<typeof memGymInstanceSchema>;
type MemGymQAPair = z.infer<typeof memGymQAPairSchema>;

export const MEMGYM_ANSWER_SYSTEM_PROMPT =
  "You must respond with a valid JSON object.";
export const MEMGYM_FACT_JUDGE_SYSTEM_PROMPT =
  "You are an independent code-memory evaluation judge. Return only valid JSON.";
export const MEMGYM_ANSWER_PROMPT_SHA256 = sha256Text(
  buildMemGymAnswerPrompt({
    notes: "{notes}",
    question: "{question}",
    repoContext: "{repo_context}",
    taskPrompt: "{task_prompt}",
  }),
);
export const MEMGYM_FACT_JUDGE_PROMPT_SHA256 = sha256Text(
  buildMemGymFactJudgePrompt({
    answer: "{answer}",
    fact: "{fact_content}",
    question: "{question}",
  }),
);

export interface Phase72MemGymOptions {
  instances: string;
  maxConcurrency: number;
  outputDir: string;
  runId: string;
  upstreamRoot: string;
  workDir: string;
}

export interface Phase72MemGymLiveConfig {
  answer: AISDKModelConfig;
  embedding: AISDKModelConfig;
  extraction: AISDKModelConfig;
  judge: AISDKModelConfig;
  reranking: AISDKModelConfig;
}

interface MemGymTask {
  instance: MemGymInstance;
  profile: MemGymProfile;
  qa: MemGymQAPair;
}

export function parsePhase72MemGymOptions(
  argv: readonly string[],
): Phase72MemGymOptions {
  const root = process.cwd();
  const cacheRoot = join(homedir(), ".cache", "goodmemory-benchmarks");
  const runId = resolveCliFlagValueStrict(argv, "--run-id") ??
    "run-phase72-memgym-generated-slice";
  assertCliPathSegmentValue({ flag: "--run-id", value: runId });
  return {
    instances: resolveCliFlagValueStrict(argv, "--instances") ?? join(
      cacheRoot,
      "phase72-runs",
      "memgym",
      "generated-v1",
      "coding_qa_verified.jsonl",
    ),
    maxConcurrency: parsePositiveInteger(
      resolveCliFlagValueStrict(argv, "--max-concurrency") ?? "2",
      "--max-concurrency",
    ),
    outputDir: resolveCliFlagValueStrict(argv, "--output-dir") ?? join(
      root,
      "reports",
      "eval",
      "research",
      "phase-72",
      "memgym",
    ),
    runId,
    upstreamRoot: resolveCliFlagValueStrict(argv, "--upstream-root") ?? join(
      cacheRoot,
      "MemGym",
    ),
    workDir: resolveCliFlagValueStrict(argv, "--work-dir") ?? join(
      cacheRoot,
      "phase72-runs",
      "memgym",
      "eval",
    ),
  };
}

export function resolvePhase72MemGymLiveConfig(
  env: Record<string, string | undefined>,
): Phase72MemGymLiveConfig {
  const answer = modelConfig(env, "GOODMEMORY_EVAL");
  if (
    answer.provider !== "openai" ||
    answer.model !== PHASE72_ANSWER_MODEL ||
    answer.baseURL !== PHASE72_ANSWER_GATEWAY
  ) {
    throw new Error(
      `Phase 72 MemGym answers must use ${PHASE72_ANSWER_MODEL} through ${PHASE72_ANSWER_GATEWAY}.`,
    );
  }
  const extraction = {
    apiKey: requiredEnv(env, "GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY"),
    baseURL: requiredEnv(env, "GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL"),
    model: requiredEnv(env, "GOODMEMORY_ASSISTED_EXTRACTOR_MODEL"),
    provider: "openai",
  } as const satisfies AISDKModelConfig;
  if (
    extraction.model !== PHASE72_ANSWER_MODEL ||
    extraction.baseURL !== PHASE72_ANSWER_GATEWAY
  ) {
    throw new Error(
      `Phase 72 MemGym extraction must use ${PHASE72_ANSWER_MODEL} through ${PHASE72_ANSWER_GATEWAY}.`,
    );
  }
  const judge = {
    apiKey: requiredEnv(env, "GOODMEMORY_JUDGE_API_KEY"),
    baseURL: requiredEnv(env, "GOODMEMORY_JUDGE_BASE_URL"),
    model: PHASE72_INDEPENDENT_JUDGE_MODEL,
    provider: "openai",
  } as const satisfies AISDKModelConfig;
  if (judge.baseURL !== PHASE72_ANSWER_GATEWAY) {
    throw new Error(
      `Phase 72 MemGym judge must use ${PHASE72_ANSWER_GATEWAY}.`,
    );
  }
  const embedding = modelConfig(env, "GOODMEMORY_EMBEDDING");
  if (embedding.provider !== "openai") {
    throw new Error("Phase 72 MemGym embeddings must use an OpenAI-compatible provider.");
  }
  return {
    answer,
    embedding,
    extraction,
    judge,
    reranking: { ...answer },
  };
}

export function buildMemGymAnswerPrompt(input: {
  notes: string;
  question: string;
  repoContext: string;
  taskPrompt: string;
}): string {
  return [
    "You are a software engineer who has been reading developer documents about a",
    "bug. Earlier documents have been removed from your context. You only have",
    "your notes and the repository structure.",
    "",
    "## Bug Description",
    input.taskPrompt,
    "",
    "## Your Notes from Previous Documents",
    input.notes,
    "",
    "## Repository Structure",
    input.repoContext,
    "",
    "## Question",
    input.question,
    "",
    "Answer using your notes and the repository structure. If your notes don't",
    'contain enough information, say "insufficient information."',
    "",
    "Return a JSON object with:",
    '- "answer": your answer (1-3 sentences)',
    '- "confidence": 0.0-1.0',
    '- "sources_used": list of document filenames you referenced in your notes',
  ].join("\n");
}

export function buildMemGymFactJudgePrompt(input: {
  answer: string;
  fact: string;
  question: string;
}): string {
  return [
    "You are evaluating whether an answer contains information consistent with a",
    "specific grounding fact.",
    "",
    "## Grounding Fact",
    input.fact,
    "",
    "## Agent's Answer",
    input.answer,
    "",
    "## Question That Was Asked",
    input.question,
    "",
    "Does the agent's answer demonstrate knowledge of this specific fact?",
    "",
    "Score criteria:",
    "- contains_fact=true if the answer reflects the core information in the fact",
    "  (does not need to be word-for-word, but must capture the same meaning)",
    "- contains_fact=false if the answer does not contain this information, or",
    "  contradicts it, or is too vague to confirm",
    "",
    'Return a JSON object with "contains_fact" (boolean), "confidence" (0.0-1.0),',
    'and "explanation" (string).',
  ].join("\n");
}

export async function runPhase72MemGym(
  options: Phase72MemGymOptions,
  env: Record<string, string | undefined> = process.env,
): Promise<Record<string, unknown>> {
  const config = resolvePhase72MemGymLiveConfig(env);
  await assertPinnedUpstream(options.upstreamRoot);
  const source = await readFile(options.instances, "utf8");
  const instances = readMemGymInstances(source);
  const sourceSha256 = sha256Text(source);
  const reportRunDir = join(options.outputDir, options.runId);
  const workRunDir = join(options.workDir, options.runId);
  await Promise.all([
    mkdir(reportRunDir, { recursive: true }),
    mkdir(workRunDir, { recursive: true }),
  ]);
  const identity = createRunIdentity({
    config,
    instances,
    runId: options.runId,
    sourceSha256,
  });
  const identityPath = join(workRunDir, "run-identity.json");
  await assertOrWriteIdentity(identityPath, identity);
  const progressPath = join(workRunDir, "progress.jsonl");
  const completed = await readProgress(progressPath);
  const memories = new Map<string, GoodMemory>();

  await mapConcurrent(instances, options.maxConcurrency, async (instance) => {
    const hasPendingGoodMemory = instance.qa_pairs.some((qa) =>
      !completed.has(caseKey({
        caseId: createCaseId(instance, qa),
        profile: "goodmemory",
      }))
    );
    if (!hasPendingGoodMemory) {
      return;
    }
    const memory = createMemGymMemory(config, instance.instance_id);
    await ingestMemGymInstance(memory, instance);
    memories.set(instance.instance_id, memory);
  });

  const tasks = instances.flatMap((instance) =>
    instance.qa_pairs.flatMap((qa) => ([
      { instance, profile: "goodmemory", qa },
      { instance, profile: "no-memory", qa },
    ] satisfies MemGymTask[]))
  );
  let appendQueue = Promise.resolve();
  await mapConcurrent(tasks, options.maxConcurrency, async (task) => {
    const key = caseKey({
      caseId: createCaseId(task.instance, task.qa),
      profile: task.profile,
    });
    if (completed.has(key)) {
      return;
    }
    const result = await evaluateTask({ config, memories, task });
    completed.set(key, result);
    appendQueue = appendQueue.then(() =>
      appendFile(progressPath, `${JSON.stringify(result)}\n`, "utf8")
    );
    await appendQueue;
    console.log("[phase-72:memgym] case completed", {
      caseId: result.caseId,
      executionFailure: result.executionFailure,
      profile: result.profile,
      recalledFacts: result.factDecisions.filter(({ recalled }) => recalled).length,
      totalFacts: result.factDecisions.length,
    });
  });
  await appendQueue;

  const results = tasks.map((task) => {
    const key = caseKey({
      caseId: createCaseId(task.instance, task.qa),
      profile: task.profile,
    });
    const result = completed.get(key);
    if (!result) {
      throw new Error(`MemGym progress is missing ${key}.`);
    }
    return result;
  });
  const goodmemoryCases = results.filter(({ profile }) => profile === "goodmemory");
  const noMemoryCases = results.filter(({ profile }) => profile === "no-memory");
  const profiles = {
    goodmemory: summarizeMemGymProfile(goodmemoryCases),
    noMemory: summarizeMemGymProfile(noMemoryCases),
  };
  const gate = evaluateMemGymComparison(profiles);
  const report = {
    benchmark: "MemGym-CodeQA",
    dataset: {
      availability: PHASE72_UPSTREAMS.memgym.codeQaAvailability,
      claimScope: "generated-slice-only",
      instanceCount: instances.length,
      instanceIds: instances.map(({ instance_id }) => instance_id),
      qaCount: instances.reduce((sum, instance) => sum + instance.qa_pairs.length, 0),
      rawArtifactsTracked: false,
      sha256: sourceSha256,
    },
    generatedAt: new Date().toISOString(),
    generatedBy: "scripts/run-phase-72-memgym.ts",
    gate,
    model: {
      answer: modelDisclosure(config.answer, "memory-and-answer"),
      extraction: modelDisclosure(config.extraction, "memory-extraction"),
      judge: modelDisclosure(config.judge, "independent-judge"),
      reranking: modelDisclosure(config.reranking, "pointwise-reranking"),
    },
    profiles,
    prompts: {
      answerSha256: MEMGYM_ANSWER_PROMPT_SHA256,
      factJudgeSha256: MEMGYM_FACT_JUDGE_PROMPT_SHA256,
      source: "MemGym evicted memory-only answer and fact-judge contracts",
    },
    protocol: {
      answererSharedAcrossProfiles: true,
      correctWhenLinkedFactRecallAtLeast: 0.5,
      includeRepoFiles: false,
      name: "evicted",
    },
    results: results.map((result) => ({
      caseId: result.caseId,
      correct: isCorrect(result),
      executionFailure: result.executionFailure,
      profile: result.profile,
      recalledFacts: result.factDecisions.filter(({ recalled }) => recalled).length,
      totalFacts: result.factDecisions.length,
    })),
    runId: options.runId,
    upstream: {
      codeCommit: PHASE72_UPSTREAMS.memgym.codeCommit,
      codeLicense: PHASE72_UPSTREAMS.memgym.codeLicense,
      repository: PHASE72_UPSTREAMS.memgym.repository,
    },
  };
  await writeFile(
    join(reportRunDir, "memgym-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  return report;
}

async function evaluateTask(input: {
  config: Phase72MemGymLiveConfig;
  memories: Map<string, GoodMemory>;
  task: MemGymTask;
}): Promise<MemGymCaseResult> {
  const caseId = createCaseId(input.task.instance, input.task.qa);
  try {
    const notes = input.task.profile === "no-memory"
      ? "(no notes taken)"
      : await recallMemGymNotes(
        requiredMemory(input.memories, input.task.instance.instance_id),
        input.task.instance,
        input.task.qa,
      );
    const answer = await requestOpenAICompatibleObject({
      model: input.config.answer,
      prompt: buildMemGymAnswerPrompt({
        notes,
        question: input.task.qa.question,
        repoContext: input.task.instance.repo_context,
        taskPrompt: input.task.instance.task_prompt,
      }),
      schema: memGymAnswerSchema,
      system: MEMGYM_ANSWER_SYSTEM_PROMPT,
      timeoutMs: 120_000,
    });
    const facts = linkedFacts(input.task.instance, input.task.qa);
    const factDecisions = await Promise.all(facts.map(async (fact) => {
      const decision = await requestOpenAICompatibleObject({
        model: input.config.judge,
        prompt: buildMemGymFactJudgePrompt({
          answer: answer.answer,
          fact: fact.content,
          question: input.task.qa.question,
        }),
        schema: memGymFactJudgeSchema,
        system: MEMGYM_FACT_JUDGE_SYSTEM_PROMPT,
        timeoutMs: 120_000,
      });
      return {
        confidence: decision.confidence,
        factId: fact.id,
        recalled: decision.contains_fact,
      } satisfies MemGymFactDecision;
    }));
    return {
      answer: answer.answer,
      caseId,
      confidence: answer.confidence,
      factDecisions,
      profile: input.task.profile,
      sourcesUsed: answer.sources_used,
    };
  } catch (error) {
    return {
      answer: "",
      caseId,
      confidence: 0,
      executionFailure: errorMessage(error),
      factDecisions: [],
      profile: input.task.profile,
      sourcesUsed: [],
    };
  }
}

function createMemGymMemory(
  config: Phase72MemGymLiveConfig,
  instanceId: string,
): GoodMemory {
  let id = 0;
  let tick = 0;
  return createGoodMemory({
    providers: {
      embedding: toProviderConfig(config.embedding),
      extraction: {
        ...toProviderConfig(config.extraction),
        contextualDescriptors: true,
        mode: "conversational",
      },
      reranking: {
        ...toProviderConfig(config.reranking),
        requestTimeoutMs: 120_000,
      },
    },
    retrieval: { preset: "recommended" },
    storage: { provider: "memory" },
    testing: {
      createId: () => `phase72-memgym-${instanceId}-${++id}`,
      now: () => new Date(Date.UTC(2026, 6, 12, 8, 0, tick++)),
    },
  });
}

async function ingestMemGymInstance(
  memory: GoodMemory,
  instance: MemGymInstance,
): Promise<void> {
  const documents = Object.entries(instance.memory_files);
  const result = await memory.remember({
    annotations: documents.map(([filename], messageIndex) => ({
      confirmed: true,
      kindHint: "fact" as const,
      messageIndex,
      metadataPatch: {
        attributes: { document: filename },
        category: "technical",
        factKind: "generic_project",
        scopeKind: "project",
        tags: ["memgym-codeqa", `document:${filename}`],
      },
      reason: "verified MemGym developer document",
      remember: "always" as const,
      verified: true,
    })),
    extractionStrategy: "llm-assisted",
    messages: documents.map(([filename, content]) => ({
      content: `[memory file: ${filename}]\n${content}`,
      role: "user",
    })),
    scope: scopeFor(instance),
  });
  if (result.warnings?.includes("assisted_extraction_failed")) {
    throw new Error(`MemGym assisted extraction failed for ${instance.instance_id}.`);
  }
  console.log("[phase-72:memgym] instance ingested", {
    accepted: result.accepted,
    documentCount: documents.length,
    instanceId: instance.instance_id,
    rejected: result.rejected,
    warnings: result.warnings ?? [],
  });
}

async function recallMemGymNotes(
  memory: GoodMemory,
  instance: MemGymInstance,
  qa: MemGymQAPair,
): Promise<string> {
  const recall = await memory.recall({
    decompose: true,
    includeEvidence: true,
    multiHop: 2,
    query: `${instance.task_prompt}\n${qa.question}`,
    rerank: true,
    retrievalProfile: "coding_agent",
    scope: scopeFor(instance),
  });
  return formatMemGymRecallNotes(recall);
}

export function formatMemGymRecallNotes(recall: RecallResult): string {
  const notes: string[] = [];
  for (const fact of recall.facts) {
    const document = fact.tags?.find((tag) => tag.startsWith("document:"))
      ?.slice("document:".length);
    notes.push(`${document ? `[${document}] ` : ""}${fact.content}`);
  }
  for (const evidence of recall.evidence) {
    notes.push(evidence.excerpt);
  }
  const unique = [...new Set(notes.map((note) => note.trim()).filter(Boolean))];
  if (unique.length === 0) {
    return "(no notes recalled)";
  }
  let result = "";
  for (const note of unique) {
    const line = `- ${note.slice(0, 4_000)}\n`;
    if (result.length + line.length > 30_000) {
      break;
    }
    result += line;
  }
  return result.trim();
}

function readMemGymInstances(source: string): MemGymInstance[] {
  const instances = source.split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return memGymInstanceSchema.parse(JSON.parse(line) as unknown);
      } catch (error) {
        throw new Error(`Invalid MemGym JSONL row ${index + 1}: ${errorMessage(error)}`);
      }
    });
  if (instances.length === 0) {
    throw new Error("MemGym generated slice is empty.");
  }
  const caseIds = new Set<string>();
  for (const instance of instances) {
    for (const qa of instance.qa_pairs) {
      const id = createCaseId(instance, qa);
      if (caseIds.has(id)) {
        throw new Error(`Duplicate MemGym case id: ${id}.`);
      }
      caseIds.add(id);
      linkedFacts(instance, qa);
    }
  }
  return instances;
}

function linkedFacts(instance: MemGymInstance, qa: MemGymQAPair) {
  const facts = new Map(instance.grounding_facts.map((fact) => [fact.id, fact]));
  return qa.linked_fact_ids.map((id) => {
    const fact = facts.get(id);
    if (!fact) {
      throw new Error(`${instance.instance_id}/${qa.qa_id} links unknown fact ${id}.`);
    }
    return fact;
  });
}

function createRunIdentity(input: {
  config: Phase72MemGymLiveConfig;
  instances: MemGymInstance[];
  runId: string;
  sourceSha256: string;
}) {
  return {
    answerGateway: input.config.answer.baseURL,
    answerModel: input.config.answer.model,
    answerPromptSha256: MEMGYM_ANSWER_PROMPT_SHA256,
    caseIds: input.instances.flatMap((instance) =>
      instance.qa_pairs.map((qa) => createCaseId(instance, qa))
    ),
    embeddingGateway: input.config.embedding.baseURL,
    embeddingModel: input.config.embedding.model,
    extractionGateway: input.config.extraction.baseURL,
    extractionModel: input.config.extraction.model,
    factJudgePromptSha256: MEMGYM_FACT_JUDGE_PROMPT_SHA256,
    judgeGateway: input.config.judge.baseURL,
    judgeModel: input.config.judge.model,
    rerankingGateway: input.config.reranking.baseURL,
    rerankingModel: input.config.reranking.model,
    runId: input.runId,
    sourceSha256: input.sourceSha256,
    upstreamCommit: PHASE72_UPSTREAMS.memgym.codeCommit,
  };
}

async function assertOrWriteIdentity(path: string, identity: unknown): Promise<void> {
  const expected = `${JSON.stringify(identity, null, 2)}\n`;
  try {
    const existing = await readFile(path, "utf8");
    if (existing !== expected) {
      throw new Error("Existing MemGym run identity does not match this invocation.");
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      await writeFile(path, expected, "utf8");
      return;
    }
    throw error;
  }
}

async function readProgress(path: string): Promise<Map<string, MemGymCaseResult>> {
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return new Map();
    }
    throw error;
  }
  const results = new Map<string, MemGymCaseResult>();
  for (const [index, line] of source.split(/\r?\n/u).entries()) {
    if (!line.trim()) {
      continue;
    }
    try {
      const result = JSON.parse(line) as MemGymCaseResult;
      results.set(caseKey(result), result);
    } catch (error) {
      throw new Error(`Invalid MemGym progress row ${index + 1}: ${errorMessage(error)}`);
    }
  }
  return results;
}

async function assertPinnedUpstream(upstreamRoot: string): Promise<void> {
  const child = Bun.spawn({
    cmd: ["git", "-C", upstreamRoot, "rev-parse", "HEAD"],
    stderr: "pipe",
    stdout: "pipe",
  });
  const stdout = await new Response(child.stdout).text();
  const stderr = await new Response(child.stderr).text();
  if (await child.exited !== 0) {
    throw new Error(`Cannot inspect MemGym upstream: ${stderr.trim()}`);
  }
  if (stdout.trim() !== PHASE72_UPSTREAMS.memgym.codeCommit) {
    throw new Error("MemGym upstream commit is not pinned.");
  }
}

async function mapConcurrent<T>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (next < values.length) {
        const index = next;
        next += 1;
        await operation(values[index]!);
      }
    },
  );
  await Promise.all(workers);
}

function modelConfig(
  env: Record<string, string | undefined>,
  prefix: string,
): AISDKModelConfig {
  const provider = requiredEnv(env, `${prefix}_PROVIDER`);
  if (provider !== "openai" && provider !== "anthropic") {
    throw new Error(`${prefix}_PROVIDER is unsupported.`);
  }
  return {
    apiKey: requiredEnv(env, `${prefix}_API_KEY`),
    baseURL: requiredEnv(env, `${prefix}_BASE_URL`),
    model: requiredEnv(env, `${prefix}_MODEL`),
    provider,
  };
}

function toProviderConfig(model: AISDKModelConfig) {
  if (model.provider !== "openai") {
    throw new Error("MemGym provider-backed memory requires OpenAI-compatible models.");
  }
  const apiKey = model.apiKey?.trim();
  const baseURL = model.baseURL?.trim();
  if (!apiKey || !baseURL) {
    throw new Error("MemGym provider-backed memory requires apiKey and baseURL.");
  }
  return {
    apiKey,
    baseURL,
    model: model.model,
    provider: "openai" as const,
  };
}

function modelDisclosure(model: AISDKModelConfig, role: string) {
  return {
    gateway: model.baseURL,
    model: model.model,
    provider: model.provider,
    role,
  };
}

function requiredEnv(
  env: Record<string, string | undefined>,
  name: string,
): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return parsed;
}

function createCaseId(instance: MemGymInstance, qa: MemGymQAPair): string {
  return `${instance.instance_id}:${qa.qa_id}`;
}

function caseKey(input: Pick<MemGymCaseResult, "caseId" | "profile">): string {
  return `${input.profile}:${input.caseId}`;
}

function scopeFor(instance: MemGymInstance): MemoryScope {
  return {
    userId: `memgym:${instance.instance_id}`,
    workspaceId: "phase-72-codeqa",
  };
}

function requiredMemory(
  memories: Map<string, GoodMemory>,
  instanceId: string,
): GoodMemory {
  const memory = memories.get(instanceId);
  if (!memory) {
    throw new Error(`MemGym memory was not prepared for ${instanceId}.`);
  }
  return memory;
}

function isCorrect(result: MemGymCaseResult): boolean {
  if (result.executionFailure || result.factDecisions.length === 0) {
    return false;
  }
  return result.factDecisions.filter(({ recalled }) => recalled).length /
      result.factDecisions.length >= 0.5;
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (import.meta.main) {
  runPhase72MemGym(parsePhase72MemGymOptions(process.argv))
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if ((report.gate as { status?: string }).status !== "passed") {
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
