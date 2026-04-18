import { describe, expect, it } from "bun:test";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

describe("release metadata and docs", () => {
  it("package metadata exposes bin, exports, and key scripts", async () => {
    const pkg = JSON.parse(
      await readFile(join(import.meta.dir, "../../package.json"), "utf8"),
    ) as {
      bin?: Record<string, string>;
      exports?: Record<string, string | { import?: string }>;
      scripts?: Record<string, string>;
    };

    expect(pkg.bin?.goodmemory).toBe("./scripts/goodmemory-cli.ts");
    expect(pkg.exports?.["."]).toBe("./src/index.ts");
    expect(pkg.exports?.["./cli"]).toBe("./src/cli.ts");
    expect(Object.keys(pkg.exports ?? {})).not.toContain("./llm/ai-sdk");
    expect(pkg.scripts?.cli).toBe("bun run scripts/goodmemory-cli.ts");
    expect(pkg.scripts?.["example:chat"]).toBe("bun run examples/basic-chat.ts");
    expect(pkg.scripts?.["example:coding-agent"]).toBe(
      "bun run examples/coding-agent.ts",
    );
    expect(pkg.scripts?.test).toBe("bun test");
    expect(pkg.scripts?.["test:all"]).toBe("bun --config=bunfig.all.toml test tests third-party");
    expect(pkg.scripts?.["test:coverage"]).toBe(
      "bun test --coverage --coverage-reporter=lcov --coverage-reporter=text && bun run scripts/check-coverage.ts",
    );
    expect(pkg.scripts?.["eval:smoke"]).toBe("bun run scripts/run-eval.ts --mode=smoke");
    expect(pkg.scripts?.["eval:fallback"]).toBe("bun run scripts/run-eval.ts --mode=fallback");
    expect(pkg.scripts?.["eval:phase-17"]).toBe("bun run scripts/run-phase-17-eval.ts");
    expect(pkg.scripts?.["eval:live"]).toBe("bun run scripts/run-eval.ts --mode=live");
    expect(pkg.scripts?.["eval:live-memory"]).toBe(
      "bun run scripts/run-eval.ts --mode=live-memory",
    );
    expect(pkg.scripts?.["eval:phase-17-live-memory"]).toBe(
      "bun run scripts/run-phase-17-live-memory.ts",
    );
    expect(pkg.scripts?.["eval:full"]).toBeUndefined();
  });

  it("package export targets resolve to files that still exist", async () => {
    const pkg = JSON.parse(
      await readFile(join(import.meta.dir, "../../package.json"), "utf8"),
    ) as {
      exports?: Record<string, string | { import?: string }>;
    };

    for (const target of Object.values(pkg.exports ?? {})) {
      if (typeof target !== "string") {
        continue;
      }

      await access(join(import.meta.dir, "../../", target));
    }
  });

  it("root exports stay aligned with the declared public surface", async () => {
    const rootModule = (await import(
      pathToFileURL(join(import.meta.dir, "../../src/index.ts")).href
    )) as Record<string, unknown>;

    expect(rootModule.createGoodMemory).toBeDefined();
    expect(rootModule.createRuntimeArchiveStore).toBeDefined();
    expect(rootModule.createRuntimeContextService).toBeDefined();
    expect(rootModule.createMemoryRepositories).toBeUndefined();
    expect(rootModule.createRecallEngine).toBeUndefined();
    expect(rootModule.createRememberEngine).toBeUndefined();
    expect(rootModule.createRuntimeSalvageHooks).toBeUndefined();
  });

  it("readme links the canonical docs, examples, cli, and eval flow", async () => {
    const readme = await readFile(join(import.meta.dir, "../../README.md"), "utf8");

    expect(readme).toContain("createGoodMemory");
    expect(readme).toContain("examples/basic-chat.ts");
    expect(readme).toContain("examples/coding-agent.ts");
    expect(readme).toContain("bun run cli -- inspect");
    expect(readme).toContain("goodmemory inspect");
    expect(readme).toContain("goodmemory export-memory");
    expect(readme).toContain("goodmemory stats");
    expect(readme).toContain("goodmemory eval inspect");
    expect(readme).toContain("goodmemory eval export-case");
    expect(readme).toContain("GoodMemory-First-Principles-and-Reference-Architecture.md");
    expect(readme).toContain("GoodMemory-OSS-Architecture-v1.md");
    expect(readme).toContain("GoodMemory-Phase-17-Quality-Gate.md");
    expect(readme).toContain("GoodMemory-PRD.md");
    expect(readme).toContain("GoodMemory-TDD-and-Evaluation-Strategy.md");
    expect(readme).toContain("GoodMemory-Strategy-Rollout-Guide.md");
    expect(readme).toContain("bun run test:coverage");
    expect(readme).toContain("bun run test:all");
    expect(readme).toContain("eval:fallback");
    expect(readme).toContain("eval:phase-17");
    expect(readme).toContain("eval:live");
    expect(readme).toContain("eval:phase-17-live-memory");
    expect(readme).toContain("observe -> assist -> promote");
    expect(readme).toContain("regression-dashboard.json");
    expect(readme).toContain("strategy-promotion-authorization.json");
    expect(readme).not.toContain("eval:full");
    expect(readme).not.toContain("goodmemory/evolution");
    expect(readme).not.toContain("strategyRollout");
    expect(readme).not.toContain("promotionGate");
  });

  it("release checklist exists and covers the final gate", async () => {
    const checklist = await readFile(
      join(import.meta.dir, "../../docs/GoodMemory-v1-Release-Checklist.md"),
      "utf8",
    );

    expect(checklist).toContain("CLI");
    expect(checklist).toContain("Examples");
    expect(checklist).toContain("Eval");
    expect(checklist).toContain("Quality Gate");
    expect(checklist).toContain("bun test");
    expect(checklist).toContain("bun run test:coverage");
    expect(checklist).toContain("eval:live");
    expect(checklist).toContain("eval:live-memory");
    expect(checklist).toContain("eval:phase-17");
    expect(checklist).toContain("eval:phase-17-live-memory");
    expect(checklist).toContain("Strategy Rollout");
    expect(checklist).toContain("strategy-promotion-gate.json");
    expect(checklist).toContain("strategy-promotion-authorization.json");
    expect(checklist).toContain("regression-dashboard.json");
    expect(checklist).toContain("public-surface-decision.json");
    expect(checklist).toContain("GoodMemory-Phase-17-Quality-Gate.md");
    expect(checklist).toContain("GoodMemory-Strategy-Rollout-Guide.md");
    expect(checklist).toContain("rules-only");
    expect(checklist).toContain("salvage hooks");
    expect(checklist).not.toContain("eval:full");
    expect(checklist).not.toContain("goodmemory/evolution");
    expect(checklist).not.toContain("strategyRollout");
    expect(checklist).not.toContain("promotionGate");
  });

  it("coding-agent example stays on the public path and avoids internal evolution imports", async () => {
    const example = await readFile(
      join(import.meta.dir, "../../examples/coding-agent.ts"),
      "utf8",
    );

    expect(example).not.toContain("../src/evolution/salvage");
    expect(example).not.toContain("createRuntimeSalvageHooks");
    expect(example).not.toContain("SESSION_ARCHIVES_COLLECTION");
  });

  it("bun test discovery is pinned to the repository test tree", async () => {
    const bunfig = await readFile(join(import.meta.dir, "../../bunfig.toml"), "utf8");
    const allBunfig = await readFile(join(import.meta.dir, "../../bunfig.all.toml"), "utf8");

    expect(bunfig).toContain('[test]');
    expect(bunfig).toContain('root = "tests"');
    expect(allBunfig).toContain('[test]');
    expect(allBunfig).toContain('root = "."');
  });
});
