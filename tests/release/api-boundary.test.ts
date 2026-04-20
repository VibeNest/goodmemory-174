import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const API_RUNTIME_FILES = [
  "src/api/createGoodMemory.ts",
  "src/api/internalRetrievalRollout.ts",
] as const;

describe("API runtime boundaries", () => {
  it("does not import eval rollout machinery from runtime API modules", async () => {
    for (const filePath of API_RUNTIME_FILES) {
      const source = await readFile(join(process.cwd(), filePath), "utf8");

      expect(source).not.toMatch(/from\s+["']\.\.\/eval\//);
    }
  });
});
