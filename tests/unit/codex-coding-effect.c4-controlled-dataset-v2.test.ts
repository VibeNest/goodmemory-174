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
  "avoid-naive-split": {
    answerTerms: /\b(?:delimiter|inside|matching|outside|quote(?:d|s)?)\b/iu,
    reference: "accepted quoted-delimiter policy",
  },
  "endpoint-open-loop": {
    answerTerms: /\b(?:bracket(?:ed|s)?|IPv6|square|unbracketed)\b/iu,
    reference: "accepted authority-host rendering policy",
  },
  "parse-result-correction": {
    answerTerms:
      /\b(?:coerc(?:e|ion)|error(?:s)?|ParseResult|SETTING_ERROR_CODES|throw|unchecked)\b/u,
    reference: "accepted setting-parser policy",
  },
  "stale-time-unit-update": {
    answerTerms: /\b(?:milliseconds|seconds)\b|\b[A-Za-z]+Ms\b/u,
    reference: "accepted configuration-duration policy",
  },
  "validated-first-delimiter": {
    answerTerms: /\b(?:complete tail|first occurrence|first delimiter|indexOf)\b/iu,
    reference: "accepted first-delimiter policy",
  },
} as const;

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

      for (const episode of fixture.dataset.episodes) {
        for (const stage of episode.stages) {
          const prompt = await readFile(
            join(fixture.root, stage.promptPath),
            "utf8",
          );
          expect(prompt.split("\n")[0]).toBe("# TypeScript utility task");
          expect(prompt).not.toContain(`# ${episode.id}`);
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

  it("keeps stale-unit source names neutral while mixing explicit millisecond fields", () => {
    const staleEpisode = c4DatasetSpecs().find((episode) =>
      episode.id === "stale-time-unit-update"
    );
    expect(staleEpisode).toBeDefined();

    const source = staleEpisode!.stages.flatMap((stage) => [
      stage.baseImplementation,
      stage.goldImplementation,
    ]).join("\n");

    expect(source).not.toMatch(/\bseconds?\b/iu);
    expect(source).not.toContain("initialSeconds");
    expect(source).not.toContain("maxSeconds");
    expect(source).not.toContain("timeoutSeconds");
    expect(source).toMatch(/\bstartMs\b/u);
    expect(source).toMatch(/\b[A-Za-z]+Ms\b/u);
  });

  it("keeps the irrelevant-history control self-contained without memory hints", () => {
    const control = c4DatasetSpecs().find((episode) =>
      episode.memoryMode === "irrelevant-control"
    );
    expect(control).toBeDefined();
    expect(control!.stages).toHaveLength(3);

    for (const stage of control!.stages) {
      const combinedSurface = `${stage.prompt}\n${stage.allowedFeedback}`;
      expect(combinedSurface).not.toMatch(
        /\b(?:irrelevant|remembered|unrelated)\b|(?:ignore|prior)\s+(?:the\s+)?(?:documentation|history|memory|visual)/iu,
      );
      expect(stage.prompt.length).toBeGreaterThan(80);
    }
  });
});
