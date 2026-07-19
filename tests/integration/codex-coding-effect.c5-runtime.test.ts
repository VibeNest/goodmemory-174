import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  restoreC5ArmModelCredential,
} from "../../scripts/codex-coding-effect/c5-runtime";
import {
  removeC3ArmModelCredential,
} from "../../scripts/codex-coding-effect/c3-runtime";
import type {
  C3NoMemoryArmRuntime,
} from "../../scripts/codex-coding-effect/c3-runtime";

describe("Codex coding-effect C5 runtime lifecycle", () => {
  it("restores an isolated copied credential after evaluator materialization", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-c5-runtime-"));
    const source = join(root, "source-auth.json");
    const codexHome = join(root, "runtime", ".codex");
    const destination = join(codexHome, "auth.json");
    try {
      await mkdir(codexHome, { recursive: true });
      await writeFile(source, '{"token":"fixture"}\n', { mode: 0o600 });
      await writeFile(destination, '{"token":"fixture"}\n', { mode: 0o600 });
      const runtime = noMemoryRuntime(root, codexHome);

      await removeC3ArmModelCredential(runtime);
      await restoreC5ArmModelCredential({ authFile: source, runtime });

      expect(await readFile(destination, "utf8")).toBe(
        '{"token":"fixture"}\n',
      );
      expect((await stat(destination)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("refuses to overwrite a credential that was not revoked", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-c5-runtime-"));
    const source = join(root, "source-auth.json");
    const codexHome = join(root, "runtime", ".codex");
    try {
      await mkdir(codexHome, { recursive: true });
      await writeFile(source, '{}\n', { mode: 0o600 });
      await writeFile(join(codexHome, "auth.json"), '{}\n', { mode: 0o600 });

      await expect(restoreC5ArmModelCredential({
        authFile: source,
        runtime: noMemoryRuntime(root, codexHome),
      })).rejects.toThrow("C5 copied model credential already exists");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

function noMemoryRuntime(
  root: string,
  codexHome: string,
): C3NoMemoryArmRuntime {
  return {
    codex: {
      executable: "/fake/codex",
      executableSha256: "a".repeat(64),
      version: "codex-cli test",
    },
    env: { CODEX_HOME: codexHome },
    instructionSha256: "b".repeat(64),
    isolation: {
      codexHomeEntryNames: [],
      goodMemoryFileCount: 0,
      hookConfigPresent: false,
      mcpConfigPresent: false,
      passed: true,
      preexistingSessionCount: 0,
      reasons: [],
    },
    permissionProfile: {
      configSha256: "c".repeat(64),
      filesystemDefault: "deny",
      minimalRead: true,
      name: "c3-task",
      networkAccess: false,
      workspaceWrite: true,
    },
    plan: {
      arm: "no-memory",
      paths: {
        armRoot: join(root, "runtime"),
        cache: join(root, "runtime", "cache"),
        codexHome,
        home: join(root, "runtime"),
        result: join(root, "result"),
        temp: join(root, "runtime", "tmp"),
        workspace: join(root, "workspace"),
      },
      scopes: {
        sessionId: "c5-session",
        userId: "c5-user",
        workspaceId: "c5-workspace",
      },
    },
  };
}
