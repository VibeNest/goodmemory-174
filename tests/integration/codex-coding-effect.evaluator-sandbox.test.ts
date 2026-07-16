import { afterEach, describe, expect, it } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  buildCodexEvaluatorSandboxConfig,
  prepareCodexEvaluatorSandbox,
} from "../../scripts/codex-coding-effect/evaluator-sandbox";
import type {
  BoundaryProcessRequest,
  BoundaryProcessResult,
} from "../../scripts/codex-coding-effect/process";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { force: true, recursive: true })
  ));
});

describe("Codex coding-effect evaluator sandbox", () => {
  it("keeps the canonical evaluator copy readable without making Codex config writable", () => {
    const sandboxRoot = "/tmp/c3/runtime/evaluator-sandbox";
    const evaluatorRoot = join(sandboxRoot, "evaluator");
    const evaluationWorkspace = join(sandboxRoot, "workspace");
    const config = buildCodexEvaluatorSandboxConfig({
      evaluationWorkspace,
      evaluatorRoot,
      profileName: "c3-evaluator",
      sandboxRoot,
    });

    expect(config).toContain('"evaluator" = "read"');
    expect(config).toContain('"workspace" = "write"');
    expect(config).toContain('"." = "read"');
    expect(config).not.toContain(
      `${JSON.stringify(resolve(sandboxRoot, "codex-home"))} = "write"`,
    );
  });

  it("fails closed when an evaluator process changes the canonical sandbox config", async () => {
    const fixture = await createFixture();
    const configPath = join(
      fixture.sandboxRoot,
      "codex-home",
      "config.toml",
    );
    const evaluatorExecutables: string[] = [];
    let mutateConfigDuringEvaluator = false;
    const runBoundary = async (
      request: BoundaryProcessRequest,
    ): Promise<BoundaryProcessResult> => {
      const command = sandboxCommand(request);
      if (command[0] === "/bin/cat") {
        const path = command[1]!;
        if (
          path === fixture.authFile ||
          path.endsWith("/.auth-alias-probe")
        ) {
          return result(1);
        }
        return result(0, await readFile(path, "utf8"));
      }
      if (command[0] === "/usr/bin/touch") {
        const path = command[1]!;
        if (
          path.startsWith(
            `${join(fixture.sandboxRoot, "evaluator")}/`,
          ) ||
          path === configPath
        ) {
          return result(1);
        }
        await writeFile(path, "");
        return result(0);
      }
      if (command[0] === fixture.bunExecutable) {
        return result(1);
      }
      if (command[0] === "/bin/sh") {
        if (command[5] !== undefined) {
          evaluatorExecutables.push(command[5]);
        }
        if (mutateConfigDuringEvaluator) {
          await writeFile(configPath, "default_permissions = \"danger\"\n");
        }
        return result(0);
      }
      throw new Error(`unexpected sandbox command ${command.join(" ")}`);
    };
    const sandbox = await prepareCodexEvaluatorSandbox({
      authFile: fixture.authFile,
      baseEnv: { PATH: "/usr/bin:/bin" },
      bunExecutable: fixture.bunExecutable,
      codexExecutable: "/opt/codex/bin/codex",
      copiedAuthRemovedBeforeEvaluator: true,
      evaluationWorkspace: fixture.evaluationWorkspace,
      evaluatorReadProbePath: fixture.evaluatorFile,
      evaluatorRoot: fixture.evaluatorRoot,
      networkProbe: async () => ({
        networkDenied: true,
        networkPositiveControl: true,
      }),
      profileName: "c3-evaluator",
      runBoundary,
      sandboxRoot: fixture.sandboxRoot,
    });
    expect(sandbox.evaluatorRoot).toBe(
      join(fixture.sandboxRoot, "evaluator"),
    );
    expect(sandbox.evidence.configWriteDenied).toBe(true);
    expect(sandbox.evidence.networkPositiveControl).toBe(true);
    expect(sandbox.evidence.originalAuthAliasDenied).toBe(true);
    expect(await readFile(
      join(sandbox.evaluatorRoot, "runner.ts"),
      "utf8",
    )).toBe("export {};\n");
    await mkdir(fixture.evaluationWorkspace, { recursive: true });
    await sandbox.runProcess({
      args: ["test.ts"],
      cwd: fixture.evaluationWorkspace,
      env: { PATH: "/usr/bin:/bin" },
      executable: "bun",
      timeoutMs: 30_000,
    });
    expect(evaluatorExecutables).toEqual([fixture.bunExecutable]);

    mutateConfigDuringEvaluator = true;

    await expect(sandbox.runProcess({
      args: ["test.ts"],
      cwd: fixture.evaluationWorkspace,
      env: { PATH: "/usr/bin:/bin" },
      executable: fixture.bunExecutable,
      timeoutMs: 30_000,
    })).rejects.toThrow("evaluator sandbox config changed");
  });
});

async function createFixture(): Promise<{
  authFile: string;
  bunExecutable: string;
  evaluationWorkspace: string;
  evaluatorFile: string;
  evaluatorRoot: string;
  sandboxRoot: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "goodmemory-evaluator-sandbox-"));
  roots.push(root);
  const authFile = join(root, "auth-source", "auth.json");
  const evaluatorRoot = join(root, "fixture", "evaluator");
  const evaluatorFile = join(evaluatorRoot, "runner.ts");
  const sandboxRoot = join(root, "runtime", "sandbox");
  const evaluationWorkspace = join(sandboxRoot, "workspace");
  await Promise.all([
    mkdir(join(root, "auth-source"), { recursive: true }),
    mkdir(evaluatorRoot, { recursive: true }),
    mkdir(sandboxRoot, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(authFile, "{}\n"),
    writeFile(evaluatorFile, "export {};\n"),
  ]);
  return {
    authFile,
    bunExecutable: resolve(process.execPath),
    evaluationWorkspace,
    evaluatorFile,
    evaluatorRoot,
    sandboxRoot,
  };
}

function sandboxCommand(request: BoundaryProcessRequest): readonly string[] {
  const separator = request.args.indexOf("--");
  if (separator === -1) {
    throw new Error("missing sandbox command separator");
  }
  return request.args.slice(separator + 1);
}

function result(
  exitCode: number,
  stdout = "",
): BoundaryProcessResult {
  return {
    durationMs: 1,
    exitCode,
    stderr: "",
    stdout,
    timedOut: false,
  };
}
