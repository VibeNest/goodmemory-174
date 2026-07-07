import { readFileSync } from "node:fs";

import { describe, expect, it } from "bun:test";

import { buildGoodMemoryCapabilityDescriptor } from "../../src/api/capabilityDescriptor";

const SERVER_JSON_URL = new URL("../../server.json", import.meta.url);
const PACKAGE_JSON_URL = new URL("../../package.json", import.meta.url);

interface ServerManifest {
  $schema: string;
  name: string;
  version: string;
  transport?: { type: string };
  packages: Array<{
    registryType: string;
    identifier: string;
    version: string;
    runtimeHint?: string;
    transport: { type: string };
    packageArguments: Array<{ type: string; name?: string; value?: string }>;
  }>;
}

function readServerManifest(): ServerManifest {
  return JSON.parse(readFileSync(SERVER_JSON_URL, "utf8")) as ServerManifest;
}

function readPackageJson(): {
  name: string;
  version: string;
  mcpName?: string;
} {
  return JSON.parse(readFileSync(PACKAGE_JSON_URL, "utf8")) as {
    name: string;
    version: string;
    mcpName?: string;
  };
}

describe("MCP registry server.json manifest", () => {
  it("uses the pinned registry schema and the descriptor's namespace", () => {
    const manifest = readServerManifest();
    expect(manifest.$schema).toContain(
      "static.modelcontextprotocol.io/schemas/",
    );
    expect(manifest.$schema).toContain("server.schema.json");
    expect(manifest.name).toBe(
      buildGoodMemoryCapabilityDescriptor().mcp.registryName,
    );
    // The registry validates npm ownership by matching package.json's mcpName
    // to server.json's name; they must stay identical or `publish` fails.
    expect(readPackageJson().mcpName).toBe(manifest.name);
  });

  it("pins the manifest and package versions to package.json", () => {
    const manifest = readServerManifest();
    const pkg = readPackageJson();
    expect(manifest.version).toBe(pkg.version);
    const npmPackage = manifest.packages.find(
      (entry) => entry.registryType === "npm",
    );
    expect(npmPackage).toBeDefined();
    expect(npmPackage?.identifier).toBe(pkg.name);
    expect(npmPackage?.version).toBe(pkg.version);
    expect(npmPackage?.transport.type).toBe("stdio");
  });

  it("launches the supported standalone MCP invocation", () => {
    const manifest = readServerManifest();
    const npmPackage = manifest.packages.find(
      (entry) => entry.registryType === "npm",
    );
    // npx -y goodmemory mcp serve --standalone --user-id {user_id}
    const positionals = npmPackage?.packageArguments
      .filter((argument) => argument.type === "positional")
      .map((argument) => argument.value);
    expect(positionals).toEqual(["mcp", "serve"]);
    const flags = npmPackage?.packageArguments
      .filter((argument) => argument.type === "named")
      .map((argument) => argument.name);
    expect(flags).toContain("--standalone");
    expect(flags).toContain("--user-id");
  });
});
