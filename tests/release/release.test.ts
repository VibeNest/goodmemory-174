import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

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
    expect(pkg.scripts?.cli).toBe("bun run scripts/goodmemory-cli.ts");
    expect(pkg.scripts?.["example:chat"]).toBe("bun run examples/basic-chat.ts");
    expect(pkg.scripts?.["example:coding-agent"]).toBe(
      "bun run examples/coding-agent.ts",
    );
  });

  it("readme links the canonical docs, examples, cli, and eval flow", async () => {
    const readme = await readFile(join(import.meta.dir, "../../README.md"), "utf8");

    expect(readme).toContain("createGoodMemory");
    expect(readme).toContain("examples/basic-chat.ts");
    expect(readme).toContain("examples/coding-agent.ts");
    expect(readme).toContain("scripts/goodmemory-cli.ts");
    expect(readme).toContain("GoodMemory-First-Principles-and-Reference-Architecture.md");
    expect(readme).toContain("GoodMemory-OSS-Architecture-v1.md");
    expect(readme).toContain("GoodMemory-PRD.md");
    expect(readme).toContain("GoodMemory-TDD-and-Evaluation-Strategy.md");
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
  });
});
