import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import type { CodexCodingEffectEvidenceClass } from "./contracts";

const identifierSchema = z.string()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9._-]*$/u);
const trimmedStringSchema = z.string().min(1).refine(
  (value) => value.trim() === value,
  "value cannot be whitespace-padded",
);
const gitCommitSchema = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const commandSchema = z.array(trimmedStringSchema).min(1);

export const CODEX_CODING_EFFECT_MEMORY_STRATA = [
  "open-loop-handoff",
  "validated-approach",
  "failure-avoidance",
  "user-correction",
  "project-convention",
  "stale-update",
  "irrelevant-memory-negative-control",
  "no-history-negative-control",
] as const;

const memoryStratumSchema = z.enum(CODEX_CODING_EFFECT_MEMORY_STRATA);

const relativeManifestPathSchema = trimmedStringSchema.refine(
  isPortableRelativePath,
  "path must be a normalized relative POSIX path without traversal",
);

const expectedMemoryDependencySchema = z.object({
  category: memoryStratumSchema,
  description: trimmedStringSchema,
}).strict();

const stageSchema = z.object({
  allowedFeedback: z.array(trimmedStringSchema),
  expectedMemoryDependencies: z.array(expectedMemoryDependencySchema),
  hiddenFailToPass: commandSchema,
  hiddenPassToPass: commandSchema,
  id: identifierSchema,
  position: z.number().int().positive(),
  promptPath: relativeManifestPathSchema,
  snapshot: gitCommitSchema,
  timeoutMs: z.number().int().positive(),
  visibleTest: commandSchema.optional(),
}).strict();

const prehistorySchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("none"),
  }).strict(),
  z.object({
    forbiddenLeakageSha256: z.array(sha256Schema),
    path: relativeManifestPathSchema,
    sha256: sha256Schema,
    source: z.literal("frozen-artifact"),
  }).strict(),
  z.object({
    source: z.literal("native-longitudinal"),
  }).strict(),
]);

const episodeSchema = z.object({
  author: trimmedStringSchema,
  claimEligibility: z.enum(["pilot-only", "claim-eligible"]),
  ecosystem: trimmedStringSchema,
  forbiddenLeakage: z.object({
    fileSha256: z.array(sha256Schema),
    strings: z.array(trimmedStringSchema),
  }).strict(),
  goldPatchPath: relativeManifestPathSchema.refine(
    (value) => value.startsWith("evaluator/"),
    "goldPatchPath must be under evaluator/",
  ),
  id: identifierSchema,
  language: trimmedStringSchema,
  preparation: z.object({
    command: commandSchema,
    networkMode: z.enum([
      "disabled",
      "dependency-setup-only",
      "allowlisted",
    ]),
  }).strict(),
  prehistory: prehistorySchema,
  provenance: trimmedStringSchema,
  repository: z.object({
    baseCommit: gitCommitSchema,
    license: trimmedStringSchema,
    url: z.url().refine(
      (value) => value.startsWith("https://") || value.startsWith("http://"),
      "repository.url must use http or https",
    ),
  }).strict(),
  sourceType: z.enum([
    "controlled-mutation",
    "real-history",
    "external-benchmark",
  ]),
  stages: z.array(stageSchema).min(1),
  stateMode: z.enum(["canonical-snapshot", "persistent-branch"]),
  strata: z.array(memoryStratumSchema).min(1),
}).strict().superRefine((episode, context) => {
  const strata = new Set<string>();
  for (const stratum of episode.strata) {
    if (strata.has(stratum)) {
      context.addIssue({
        code: "custom",
        message: `episode ${episode.id} contains duplicate stratum ${stratum}`,
        path: ["strata"],
      });
    }
    strata.add(stratum);
  }

  const stageIds = new Set<string>();
  for (const [index, stage] of episode.stages.entries()) {
    if (stageIds.has(stage.id)) {
      context.addIssue({
        code: "custom",
        message: `episode ${episode.id} contains duplicate stage id ${stage.id}`,
        path: ["stages", index, "id"],
      });
    }
    stageIds.add(stage.id);

    if (stage.position !== index + 1) {
      context.addIssue({
        code: "custom",
        message: `episode ${episode.id} stage positions must be contiguous from 1`,
        path: ["stages", index, "position"],
      });
    }

    for (const dependency of stage.expectedMemoryDependencies) {
      if (!strata.has(dependency.category)) {
        context.addIssue({
          code: "custom",
          message:
            `stage ${stage.id} uses undeclared memory stratum ${dependency.category}`,
          path: ["stages", index, "expectedMemoryDependencies"],
        });
      }
    }
  }
});

const datasetSchema = z.object({
  datasetId: identifierSchema,
  episodes: z.array(episodeSchema).min(1),
  schemaVersion: z.literal(1),
}).strict().superRefine((dataset, context) => {
  const episodeIds = new Set<string>();
  for (const [index, episode] of dataset.episodes.entries()) {
    if (episodeIds.has(episode.id)) {
      context.addIssue({
        code: "custom",
        message: `dataset contains duplicate episode id ${episode.id}`,
        path: ["episodes", index, "id"],
      });
    }
    episodeIds.add(episode.id);
  }
});

export type CodexCodingEffectDataset = z.infer<typeof datasetSchema>;
export type CodexCodingEffectEpisode = CodexCodingEffectDataset["episodes"][number];

export interface LoadedCodexCodingEffectDataset {
  dataset: CodexCodingEffectDataset;
  manifestPath: string;
  manifestSha256: string;
}

export function parseCodexCodingEffectDataset(
  value: unknown,
): CodexCodingEffectDataset {
  const result = datasetSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  const details = result.error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
  });
  throw new Error(`invalid Codex coding-effect dataset: ${details.join("; ")}`);
}

export function selectCodexCodingEffectEpisodes(
  dataset: CodexCodingEffectDataset,
  input: {
    episodeIds: readonly string[];
    evidenceClass: CodexCodingEffectEvidenceClass;
  },
): CodexCodingEffectEpisode[] {
  const requestedIds = new Set(input.episodeIds);
  const knownIds = new Set(dataset.episodes.map((episode) => episode.id));
  for (const episodeId of requestedIds) {
    if (!knownIds.has(episodeId)) {
      throw new Error(`dataset does not contain selected episode ${episodeId}`);
    }
  }

  const selected = input.episodeIds.length === 0
    ? [...dataset.episodes]
    : dataset.episodes.filter((episode) => requestedIds.has(episode.id));

  if (input.evidenceClass === "codex-coding-effect-candidate") {
    const pilotOnly = selected.find(
      (episode) => episode.claimEligibility === "pilot-only",
    );
    if (pilotOnly) {
      throw new Error(
        `claim-candidate runs cannot select pilot-only episode ${pilotOnly.id}`,
      );
    }
  }

  return selected;
}

export async function loadCodexCodingEffectDataset(
  datasetRoot: string,
): Promise<LoadedCodexCodingEffectDataset> {
  const manifestPath = join(datasetRoot, "manifest.json");
  const raw = await readFile(manifestPath, "utf8");
  const value: unknown = JSON.parse(raw);

  return {
    dataset: parseCodexCodingEffectDataset(value),
    manifestPath,
    manifestSha256: createHash("sha256").update(raw).digest("hex"),
  };
}

function isPortableRelativePath(value: string): boolean {
  if (value.startsWith("/") || value.includes("\\")) {
    return false;
  }

  const segments = value.split("/");
  return segments.every(
    (segment) => segment.length > 0 && segment !== "." && segment !== "..",
  );
}
