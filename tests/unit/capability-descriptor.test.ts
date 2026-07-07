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

function readClaimFragments(relativePath: string): string[] {
  const url = new URL(`../../${relativePath}`, import.meta.url);
  const claim = JSON.parse(readFileSync(url, "utf8")) as {
    publicClaim?: { readmeRequiredFragments?: string[] };
  };
  return claim.publicClaim?.readmeRequiredFragments ?? [];
}

// Each benchmark's headline numbers must stay identical to the gate-verified
// claim declaration — the descriptor is a discovery artifact, not a place to
// hand-copy (and let drift) numbers a public claim gate already pins.
const BENCHMARK_PINS: Record<string, string[]> = {
  LongMemEval: ["0.720", "0.888"],
  MemoryAgentBench: ["CR 0.959", "TTL 0.767"],
  LoCoMo: ["0.6117", "0.837"],
  BEAM: ["0.802", "0.7225", "0.49"],
  ImplicitMemBench: ["0.691", "0.400"],
};

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

  it("pins every benchmark headline to its gate-verified claim declaration", () => {
    const descriptor = buildGoodMemoryCapabilityDescriptor();
    for (const benchmark of descriptor.benchmarks) {
      const fragments = readClaimFragments(benchmark.claimDeclaration);
      expect(fragments.length).toBeGreaterThan(0);
      const surfaced = `${benchmark.result} ${benchmark.reference}`;
      const pins = BENCHMARK_PINS[benchmark.name] ?? [];
      expect(pins.length).toBeGreaterThan(0);
      for (const pin of pins) {
        // Present in the descriptor AND still the gate-verified number.
        expect(surfaced).toContain(pin);
        expect(fragments).toContain(pin);
      }
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
