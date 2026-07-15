import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertCanaryExecutableInsidePrefix } from "../../scripts/codex-coding-effect/native-canary-runtime";
import {
  assertTrustedManagedHooks,
  captureGitSourceIdentity,
} from "../../scripts/codex-coding-effect/native-canary";

describe("Codex native canary runtime boundary", () => {
  it("accepts an npm-style bin symlink whose target stays inside the isolated prefix", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-c2-runtime-"));
    try {
      const prefix = join(root, "prefix");
      const target = join(prefix, "lib", "goodmemory.js");
      const bin = join(prefix, "bin", "goodmemory");
      await mkdir(join(prefix, "bin"), { recursive: true });
      await mkdir(join(prefix, "lib"), { recursive: true });
      await writeFile(target, "#!/usr/bin/env node\n", "utf8");
      await symlink("../lib/goodmemory.js", bin);

      expect(await assertCanaryExecutableInsidePrefix(
        bin,
        "isolated goodmemory executable",
        prefix,
      )).toBe(await realpath(target));
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("accepts only the exact GoodMemory-managed commands for the isolated home", () => {
    const home = "/tmp/goodmemory-c2/home";
    const command = (hook: string) =>
      `GOODMEMORY_HOME='${home}' GOODMEMORY_MANAGED_BY='goodmemory' goodmemory codex hook ${hook}`;
    const hooks = JSON.stringify({
      hooks: {
        PreToolUse: [{ hooks: [{ command: command("pre-tool-use"), type: "command" }], matcher: "Bash" }],
        SessionStart: [{
          hooks: [{ command: command("session-start"), type: "command" }],
          matcher: "startup|resume|clear|compact",
        }],
        Stop: [{ hooks: [{ command: command("session-stop"), type: "command" }] }],
        UserPromptSubmit: [{
          hooks: [{ command: command("user-prompt-submit"), type: "command" }],
        }],
      },
    });

    expect(() => assertTrustedManagedHooks(hooks, home)).not.toThrow();
    expect(() => assertTrustedManagedHooks(
      hooks.replaceAll(home, "/tmp/untrusted-home"),
      home,
    )).toThrow("is not GoodMemory-managed");
  });

  it("rejects a bin symlink that escapes the isolated prefix", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-c2-runtime-"));
    try {
      const prefix = join(root, "prefix");
      const outside = join(root, "outside.js");
      const bin = join(prefix, "bin", "goodmemory");
      await mkdir(join(prefix, "bin"), { recursive: true });
      await writeFile(outside, "#!/usr/bin/env node\n", "utf8");
      await symlink(outside, bin);

      await expect(assertCanaryExecutableInsidePrefix(
        bin,
        "isolated goodmemory executable",
        prefix,
      )).rejects.toThrow("must resolve inside the isolated npm prefix");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("binds the source commit, tracked diff, and untracked file hashes", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-c2-source-"));
    try {
      await runGit(root, ["init", "--quiet", "--initial-branch=main"]);
      await runGit(root, ["config", "user.email", "test@example.com"]);
      await runGit(root, ["config", "user.name", "Test"]);
      await writeFile(join(root, "tracked.txt"), "before\n", "utf8");
      await runGit(root, ["add", "tracked.txt"]);
      await runGit(root, ["commit", "--quiet", "-m", "fixture"]);
      const commit = (await runGit(root, ["rev-parse", "HEAD"])).trim();
      await writeFile(join(root, "tracked.txt"), "after\n", "utf8");
      await writeFile(join(root, "untracked.txt"), "new\n", "utf8");

      const identity = await captureGitSourceIdentity(root);

      expect(identity).toMatchObject({ commit, dirty: true });
      expect(identity.dirtyDiffSha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(identity.dirtyStateSha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(identity.untrackedFiles).toEqual([{
        path: "untracked.txt",
        sha256: "7aa7a5359173d05b63cfd682e3c38487f3cb4f7f1d60659fe59fab1505977d4c",
      }]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

async function runGit(cwd: string, args: string[]): Promise<string> {
  const child = Bun.spawn({
    cmd: ["git", ...args],
    cwd,
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stderr, stdout] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`git ${args[0]} failed: ${stderr}`);
  }
  return stdout;
}
