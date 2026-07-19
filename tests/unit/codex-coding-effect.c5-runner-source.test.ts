import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assertC5RunnerSourceStateIdentical,
  captureC5RunnerSourceState,
} from "../../scripts/codex-coding-effect/c5-runner-source";

describe("Codex coding-effect C5 runner source", () => {
  it("captures and authenticates the complete recursive runtime import closure", async () => {
    const repositoryRoot = await createRunnerRepository();
    try {
      await Promise.all([
        writeFile(
          join(repositoryRoot, "scripts", "codex-coding-effect", "nested", "z.ts"),
          "NESTED_PRIVATE_SOURCE\n",
          "utf8",
        ),
        writeFile(
          join(repositoryRoot, "scripts", "verify-codex-coding-effect-c5-pilot.ts"),
          'import "./codex-coding-effect/nested/z";\nOPTIONAL_VERIFY_SOURCE\n',
          "utf8",
        ),
        writeFile(
          join(repositoryRoot, "scripts", "unrelated.ts"),
          "OUT_OF_SCOPE_SOURCE\n",
          "utf8",
        ),
      ]);

      const captured = await captureC5RunnerSourceState({ repositoryRoot });

      expect(captured.state.files.map((file) => file.path)).toEqual([
        "bun.lock",
        "bunfig.toml",
        "package.json",
        "scripts/codex-coding-effect/a.ts",
        "scripts/codex-coding-effect/nested/z.ts",
        "scripts/prepare-codex-coding-effect-c5-pilot.ts",
        "scripts/run-codex-coding-effect-c5-pilot.ts",
        "scripts/shared.ts",
        "scripts/verify-codex-coding-effect-c5-pilot.ts",
        "tsconfig.json",
      ]);
      expect(captured.state.files).toEqual(expect.arrayContaining([
        {
          bytes: Buffer.byteLength('import "../shared";\nRUNNER_SOURCE\n'),
          path: "scripts/codex-coding-effect/a.ts",
          sourceBase64: Buffer.from(
            'import "../shared";\nRUNNER_SOURCE\n',
          ).toString("base64"),
          sha256: sha256('import "../shared";\nRUNNER_SOURCE\n'),
        },
      ]));
      expect(captured.state.aggregateSha256).toBe(
        sha256(`${JSON.stringify(captured.state.files)}\n`),
      );
      expect(JSON.parse(captured.sourceStateArtifactBytes) as unknown).toEqual(
        captured.state,
      );
      expect(captured.sourceStateArtifactBytes).not.toContain(repositoryRoot);
      expect(captured.sourceStateArtifactBytes).not.toContain("PRIVATE_SOURCE");
      expect(captured.sourceStateArtifactBytes).not.toContain("OUT_OF_SCOPE");
    } finally {
      await rm(repositoryRoot, { force: true, recursive: true });
    }
  });

  it("asserts identical snapshots and fails closed on file or directory drift", async () => {
    const repositoryRoot = await createRunnerRepository();
    try {
      const before = await captureC5RunnerSourceState({ repositoryRoot });
      const unchanged = await captureC5RunnerSourceState({ repositoryRoot });
      expect(() => assertC5RunnerSourceStateIdentical(
        before.state,
        unchanged.state,
      )).not.toThrow();

      await writeFile(
        join(repositoryRoot, "scripts", "codex-coding-effect", "a.ts"),
        "CHANGED_SOURCE\n",
        "utf8",
      );
      const changed = await captureC5RunnerSourceState({ repositoryRoot });
      expect(() => assertC5RunnerSourceStateIdentical(before.state, changed.state))
        .toThrow("C5 runner source changed during the live pilot");

      await writeFile(
        join(repositoryRoot, "scripts", "codex-coding-effect", "a.ts"),
        'import "../shared";\nRUNNER_SOURCE\n',
        "utf8",
      );
      await writeFile(
        join(repositoryRoot, "scripts", "codex-coding-effect", "new.ts"),
        "NEW_SOURCE\n",
        "utf8",
      );
      const added = await captureC5RunnerSourceState({ repositoryRoot });
      expect(() => assertC5RunnerSourceStateIdentical(before.state, added.state))
        .not.toThrow();

      await rm(join(repositoryRoot, "scripts", "codex-coding-effect", "new.ts"));
      await rm(join(repositoryRoot, "scripts", "codex-coding-effect", "a.ts"));
      await expect(captureC5RunnerSourceState({ repositoryRoot }))
        .rejects.toThrow("missing imported C5 runner source");
    } finally {
      await rm(repositoryRoot, { force: true, recursive: true });
    }
  });

  it("rejects symlinks anywhere in the captured runner surface", async () => {
    const repositoryRoot = await createRunnerRepository();
    const externalRoot = await mkdtemp(join(tmpdir(), "goodmemory-c5-external-"));
    try {
      const externalFile = join(externalRoot, "external.ts");
      await writeFile(externalFile, "EXTERNAL_SECRET\n", "utf8");
      await symlink(
        externalFile,
        join(repositoryRoot, "scripts", "codex-coding-effect", "link.ts"),
      );
      await writeFile(
        join(repositoryRoot, "scripts", "run-codex-coding-effect-c5-pilot.ts"),
        'import "./codex-coding-effect/link";\nRUN_SOURCE\n',
        "utf8",
      );

      await expect(captureC5RunnerSourceState({ repositoryRoot }))
        .rejects.toThrow("C5 runner source entries must not be symbolic links");
    } finally {
      await Promise.all([
        rm(repositoryRoot, { force: true, recursive: true }),
        rm(externalRoot, { force: true, recursive: true }),
      ]);
    }
  });

  it("requires the package, runner directory, prepare CLI, and run CLI", async () => {
    const repositoryRoot = await createRunnerRepository();
    try {
      await rm(join(
        repositoryRoot,
        "scripts",
        "prepare-codex-coding-effect-c5-pilot.ts",
      ));

      await expect(captureC5RunnerSourceState({ repositoryRoot }))
        .rejects.toThrow("missing required C5 runner source entry");
    } finally {
      await rm(repositoryRoot, { force: true, recursive: true });
    }
  });
});

async function createRunnerRepository(): Promise<string> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "goodmemory-c5-runner-"));
  await mkdir(
    join(repositoryRoot, "scripts", "codex-coding-effect", "nested"),
    { recursive: true },
  );
  await Promise.all([
    writeFile(join(repositoryRoot, "bun.lock"), "LOCK\n", "utf8"),
    writeFile(join(repositoryRoot, "bunfig.toml"), "[test]\n", "utf8"),
    writeFile(join(repositoryRoot, "package.json"), "{\"private\":true}\n", "utf8"),
    writeFile(join(repositoryRoot, "tsconfig.json"), "{}\n", "utf8"),
    writeFile(join(repositoryRoot, "scripts", "shared.ts"), "SHARED_SOURCE\n", "utf8"),
    writeFile(
      join(repositoryRoot, "scripts", "codex-coding-effect", "a.ts"),
      'import "../shared";\nRUNNER_SOURCE\n',
      "utf8",
    ),
    writeFile(
      join(repositoryRoot, "scripts", "prepare-codex-coding-effect-c5-pilot.ts"),
      'import "./codex-coding-effect/a";\nPREPARE_SOURCE\n',
      "utf8",
    ),
    writeFile(
      join(repositoryRoot, "scripts", "run-codex-coding-effect-c5-pilot.ts"),
      'import "./codex-coding-effect/a";\nRUN_SOURCE\n',
      "utf8",
    ),
  ]);
  return repositoryRoot;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
