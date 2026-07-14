import { readFileSync } from "node:fs";

import { describe, expect, it } from "bun:test";

import { buildGoodMemoryCapabilityDescriptor } from "../../src/api/capabilityDescriptor";

const STATIC_DESCRIPTOR_URL = new URL(
  "../../.well-known/goodmemory.json",
  import.meta.url,
);
const PACKAGE_JSON_URL = new URL("../../package.json", import.meta.url);

function readPackageJson(): { version: string; bin: Record<string, string> } {
  return JSON.parse(readFileSync(PACKAGE_JSON_URL, "utf8")) as {
    version: string;
    bin: Record<string, string>;
  };
}

describe("GoodMemory capability descriptor", () => {
  it("keeps the committed .well-known/goodmemory.json in sync with the builder", () => {
    const generated = `${JSON.stringify(
      buildGoodMemoryCapabilityDescriptor(),
      null,
      2,
    )}\n`;
    const committed = readFileSync(STATIC_DESCRIPTOR_URL, "utf8");
    // Regenerate with: bun run scripts/generate-capability-descriptor.ts
    expect(committed).toBe(generated);
  });

  it("reports the package version and derives version-pinned install commands", () => {
    const { version } = readPackageJson();
    const descriptor = buildGoodMemoryCapabilityDescriptor();
    expect(descriptor.version).toBe(version);
    expect(descriptor.install.npmGlobal).toBe(
      `npm install -g goodmemory@${version}`,
    );
    expect(descriptor.install.bun).toBe(`bun add goodmemory@${version}`);
    expect(descriptor.onboarding[0]?.steps?.[0]).toBe(
      `npm install -g goodmemory@${version}`,
    );
  });

  it("advertises the MCP command that the package bin actually exposes", () => {
    const { bin } = readPackageJson();
    const descriptor = buildGoodMemoryCapabilityDescriptor();
    expect(bin[descriptor.mcp.command]).toBeDefined();
    expect(descriptor.mcp.standaloneArgs).toContain("--standalone");
    expect(descriptor.mcp.primaryTools).toEqual([
      "goodmemory_get_context",
      "goodmemory_remember",
    ]);
  });

  it("does not present historical benchmark evidence as current runtime claims", () => {
    const descriptor = buildGoodMemoryCapabilityDescriptor();
    expect(descriptor.benchmarks.currentClaims).toEqual([]);
    expect(descriptor.benchmarks.historicalEvidence.url).toBe(
      "https://github.com/hjqcan/GoodMemory/tree/main/benchmark-claims",
    );
    expect(descriptor.benchmarks.historicalEvidence.note).toContain(
      "not current-production claims",
    );
    const surfaced = JSON.stringify(descriptor.benchmarks);
    for (const staleHeadline of ["0.888", "0.837", "0.802", "0.691"]) {
      expect(surfaced).not.toContain(staleHeadline);
    }
  });

  it("names three onboarding paths with distinct delivery methods", () => {
    const descriptor = buildGoodMemoryCapabilityDescriptor();
    expect(descriptor.onboarding.map((path) => path.method)).toEqual([
      "cli",
      "mcp",
      "http",
    ]);
    expect(descriptor.kind).toBe("memory-layer");
    expect(descriptor.notA).toContain("agent-framework");
  });

  it("honors an injected version without touching the filesystem", () => {
    const descriptor = buildGoodMemoryCapabilityDescriptor({
      version: "9.9.9",
    });
    expect(descriptor.version).toBe("9.9.9");
    expect(descriptor.install.npmPackage).toBe("npm install goodmemory@9.9.9");
  });
});
