import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  c4DatasetAuthorAttestation,
  c4DatasetSpecs,
  cleanupC4ControlledPilotDataset,
  prepareC4ControlledPilotDataset,
} from "../../scripts/codex-coding-effect/c4-controlled-dataset";

const POSITIVE_POLICY_EXPECTATIONS = {
  "delimiter-boundary-policy": {
    answerTerms:
      /\b(?:first|last|head|tail|indexOf|lastIndexOf)\b/iu,
    reference: "accepted delimiter-boundary policy",
    stageOneTerms: [
      /\blast occurrence\b/iu,
      /\bcomplete head\b/iu,
      /\breturn null\b/iu,
    ],
  },
  "endpoint-open-loop": {
    answerTerms:
      /\b(?:bracket(?:ed|s)?|colon|IPv6|parenthes(?:es|ized)|RFC|scheme|square|unbracketed|URI|URL)\b/iu,
    reference: "accepted endpoint-display policy",
    stageOneTerms: [
      /\bcolon\b/iu,
      /\bparenthes(?:es|ized)\b/iu,
      /\balready\b/iu,
    ],
  },
  "field-boundary-policy": {
    answerTerms:
      /\b(?:delimiter|double|inside|literal|outside|protected|quote(?:d|s)?|single)\b/iu,
    reference: "accepted field-boundary policy",
    stageOneTerms: [
      /\bonly double quotes\b/iu,
      /\btwo consecutive double quotes\b/iu,
      /\bsingle quotes are ordinary\b/iu,
    ],
  },
  "parse-result-correction": {
    answerTerms:
      /\b(?:case|error(?:s)?|invalid|space|tab|trim|TypeScript union|U\+0020)\b/iu,
    reference: "accepted setting-input policy",
    stageOneTerms: [
      /U\+0020/u,
      /\btabs?\b/iu,
      /\bcase\b/iu,
      /\bTypeScript union\b/u,
      /\bshared\b.*\berror\b/iu,
    ],
  },
  "duration-configuration-policy": {
    answerTerms:
      /\b(?:milliseconds|quantum|quanta|seconds)\b|\b(?:250|1_000|1000)\b|\b[A-Za-z]+Ms\b/u,
    reference: "accepted duration-boundary policy",
    stageOneTerms: [
      /\b250\b/u,
      /\bends? in Ms\b/u,
      /\bunchanged\b/iu,
    ],
  },
} as const;

const RETIRED_LEAKAGE_IDS = [
  "avoid-naive-split",
  "irrelevant-history-control",
  "stale-time-unit-update",
  "validated-first-delimiter",
] as const;

describe("Codex coding-effect C4 controlled dataset v2 difficulty", () => {
  it("materializes v2 with neutral prompt titles and canonical snapshots", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "goodmemory-c4-v2-spec-"));
    const fixture = await prepareC4ControlledPilotDataset({
      root: join(sandbox, "dataset"),
    });
    try {
      expect(fixture.dataset.datasetId).toBe("codex-c4-controlled-pilot-v2");
      expect(fixture.dataset.episodes).toHaveLength(6);
      expect(fixture.dataset.episodes.every((episode) =>
        episode.stateMode === "canonical-snapshot" &&
        episode.stages.length === 3
      )).toBe(true);
      expect(fixture.dataset.episodes.map((episode) => episode.id)).toEqual([
        "endpoint-open-loop",
        "delimiter-boundary-policy",
        "field-boundary-policy",
        "parse-result-correction",
        "duration-configuration-policy",
        "independent-string-utilities",
      ]);
      const settings = fixture.dataset.episodes.find((episode) =>
        episode.id === "parse-result-correction"
      )!;
      expect(settings.allowedPublicLeakageRelations?.some((relation) =>
        relation[0] === " info " && relation[1] === true
      )).toBe(true);
      expect(settings.allowedPublicLeakageRelations?.some((relation) =>
        relation[0] === "INFO" && relation[1] === "invalid-level"
      )).toBe(false);

      for (const episode of fixture.dataset.episodes) {
        for (const stage of episode.stages) {
          const prompt = await readFile(
            join(fixture.root, stage.promptPath),
            "utf8",
          );
          expect(prompt.split("\n")[0]).toBe("# TypeScript utility task");
          expect(prompt).not.toContain(`# ${episode.id}`);
          for (const retiredId of RETIRED_LEAKAGE_IDS) {
            expect(stage.promptPath).not.toContain(retiredId);
            expect(prompt).not.toContain(retiredId);
          }
        }
      }

      expect(JSON.parse(await readFile(
        join(fixture.root, "provenance", "author-attestation.json"),
        "utf8",
      ))).toEqual(c4DatasetAuthorAttestation());
    } finally {
      await cleanupC4ControlledPilotDataset(fixture);
      await rm(sandbox, { force: true, recursive: true });
    }
  }, 120_000);

  it("binds the aggregate v1 ceiling trigger without claiming paired-outcome blindness", () => {
    expect(c4DatasetAuthorAttestation()).toMatchObject({
      c4PairedOutcomesInspectedBeforeFreeze: false,
      c5PairedOutcomesInspectedBeforeFreeze: false,
      datasetId: "codex-c4-controlled-pilot-v2",
      priorV1BaselineCeiling: {
        attemptedStages: 6,
        decision: "redesign-episodes-before-c5",
        evidenceScope: "aggregate-ceiling-decision-only",
        patchesInspected: false,
        reportPath:
          "reports/quality-gates/phase-73/c4-baseline-ceiling-pilot-v1.json",
        reportSha256:
          "28d3bc535cd1c26ed7e30fc7b541f66e16548ff4219d870050adbd823c71a952",
        resolvedStages: 6,
        transcriptsInspected: false,
      },
      schemaVersion: 3,
    });
  });

  it("makes stage one establish each positive policy without restating it later", () => {
    const episodes = c4DatasetSpecs();
    const positiveEpisodes = episodes.filter((episode) =>
      episode.memoryMode === "required"
    );

    expect(episodes).toHaveLength(6);
    expect(new Set(episodes.map((episode) => episode.repositoryId)).size).toBe(2);
    expect(positiveEpisodes).toHaveLength(5);

    for (const episode of positiveEpisodes) {
      const expectation = POSITIVE_POLICY_EXPECTATIONS[
        episode.id as keyof typeof POSITIVE_POLICY_EXPECTATIONS
      ];
      expect(expectation).toBeDefined();
      expect(episode.stages).toHaveLength(3);
      expect(episode.stages[0]!.prompt).toContain("Project policy:");
      for (const term of expectation.stageOneTerms) {
        expect(episode.stages[0]!.prompt).toMatch(term);
      }

      for (const stage of episode.stages.slice(1)) {
        const visibleAndHidden = [
          ...stage.failToPass,
          ...stage.passToPass,
        ].map((testCase) => JSON.stringify(testCase));
        const combinedSurface = `${stage.prompt}\n${stage.allowedFeedback}`;
        const answerSurface = combinedSurface.replaceAll(
          expectation.reference,
          "",
        );

        expect(stage.prompt).toContain(expectation.reference);
        expect(stage.allowedFeedback).toContain(expectation.reference);
        expect(combinedSurface).not.toContain("Project policy:");
        expect(answerSurface).not.toMatch(expectation.answerTerms);
        expect(stage.failToPass.length).toBeGreaterThanOrEqual(3);
        expect(stage.passToPass.length).toBeGreaterThanOrEqual(2);
        expect(stage.visible).toHaveLength(1);
        expect(visibleAndHidden).not.toContain(JSON.stringify(stage.visible[0]));
      }
    }
  });

  it("makes every stage-one policy sufficient for the later hidden semantics", () => {
    const episodes = c4DatasetSpecs();
    const endpoint = episodes.find((episode) =>
      episode.id === "endpoint-open-loop"
    )!;
    for (const stage of endpoint.stages.slice(1)) {
      expect(stage.failToPass.every((testCase) =>
        typeof testCase.expected === "string" &&
        testCase.expected.includes("(") &&
        testCase.expected.includes(")") &&
        !testCase.expected.includes("[")
      )).toBe(true);
      expect(stage.passToPass.some((testCase) =>
        JSON.stringify(testCase.args).includes("(")
      )).toBe(true);
    }

    const delimiter = episodes.find((episode) =>
      episode.id === "delimiter-boundary-policy"
    )!;
    for (const stage of delimiter.stages.slice(1)) {
      expect(stage.failToPass.every((testCase) =>
        Array.isArray(testCase.expected) &&
        String(testCase.expected[0]).length > String(testCase.expected[1]).length
      )).toBe(true);
      expect(stage.passToPass.some((testCase) =>
        testCase.expected === null
      )).toBe(true);
    }

    const fields = episodes.find((episode) =>
      episode.id === "field-boundary-policy"
    )!;
    for (const stage of fields.stages.slice(1)) {
      const hiddenInputs = JSON.stringify(stage.failToPass);
      const passInputs = JSON.stringify(stage.passToPass);
      expect(hiddenInputs).toContain('""');
      expect(passInputs).toContain("'");
    }

    const settings = episodes.find((episode) =>
      episode.id === "parse-result-correction"
    )!;
    for (const stage of settings.stages.slice(1)) {
      const hiddenInputs = stage.failToPass.map((testCase) =>
        String(testCase.args[0])
      );
      expect(hiddenInputs.some((value) =>
        value.startsWith(" ") && value.endsWith(" ")
      )).toBe(true);
      expect(hiddenInputs.some((value) => value.includes("\t"))).toBe(true);
      expect(hiddenInputs.some((value) =>
        value === value.toUpperCase() && value !== value.toLowerCase()
      )).toBe(true);
    }

    const duration = episodes.find((episode) =>
      episode.id === "duration-configuration-policy"
    )!;
    expect(duration.stages[1]!.failToPass).toContainEqual({
      args: [{ capMs: 8000, initial: 1 }],
      expected: { capMs: 8000, initialMs: 250 },
    });
    expect(duration.stages[2]!.failToPass).toContainEqual({
      args: [{ skewMs: 50, startMs: 1000, timeout: 2 }],
      expected: 1550,
    });
  });

  it("backs failure, correction, and stale-update strata with real history", () => {
    const episodes = c4DatasetSpecs();
    const history = (episodeId: string) =>
      episodes.find((episode) => episode.id === episodeId)!.history
        .map((record) => record.text)
        .join("\n");

    expect(history("field-boundary-policy")).toMatch(
      /\btried\b.*\bcorrupted\b|\bfailed approach\b/isu,
    );
    expect(history("parse-result-correction")).toMatch(
      /\breject\b.*\bcorrected\b/isu,
    );
    expect(history("duration-configuration-policy")).toMatch(
      /\bearlier instruction\b.*\bsuperseded\b.*\bnewer rule\b/isu,
    );
  });

  it("keeps duration source names neutral while mixing explicit millisecond fields", () => {
    const durationEpisode = c4DatasetSpecs().find((episode) =>
      episode.id === "duration-configuration-policy"
    );
    expect(durationEpisode).toBeDefined();

    const source = durationEpisode!.stages.flatMap((stage) => [
      stage.baseImplementation,
      stage.goldImplementation,
    ]).join("\n");

    expect(source).not.toMatch(/\bseconds?\b/iu);
    expect(source).not.toContain("initialSeconds");
    expect(source).not.toContain("maxSeconds");
    expect(source).not.toContain("timeoutSeconds");
    expect(source).not.toContain("1_000");
    expect(source).toContain("250");
    expect(source).toMatch(/\bstartMs\b/u);
    expect(source).toMatch(/\b[A-Za-z]+Ms\b/u);
  });

  it("keeps the irrelevant-history control self-contained without memory hints", () => {
    const control = c4DatasetSpecs().find((episode) =>
      episode.memoryMode === "irrelevant-control"
    );
    expect(control).toBeDefined();
    expect(control!.id).toBe("independent-string-utilities");
    expect(control!.stages).toHaveLength(3);

    for (const stage of control!.stages) {
      const combinedSurface = `${stage.prompt}\n${stage.allowedFeedback}`;
      expect(combinedSurface).not.toMatch(
        /\b(?:ignore|irrelevant|memory|prior|remembered|unrelated)\b/iu,
      );
      expect(stage.prompt.length).toBeGreaterThan(80);
    }
  });
});
