import { describe, expect, it } from "bun:test";
import { runCLI } from "../../src/cli";

describe("inspector CLI", () => {
  it("renders inspector help", async () => {
    const result = await runCLI(["inspector", "serve", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("binds 127.0.0.1 only");
    expect(result.stdout).toContain("read-only reads, gated writes");
  });

  it("prints local dry-run configuration without requiring --user-id or starting a server", async () => {
    const result = await runCLI([
      "inspector",
      "serve",
      "--port",
      "4920",
      "--token",
      "inspector-cli-token",
      "--dry-run",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      audited: true,
      bindHost: "127.0.0.1",
      cors: false,
      gated: true,
      mutationRoutes: true,
      port: 4920,
      rawTranscript: false,
      readOnly: false,
      token: "inspector-cli-token",
      tokenRequired: true,
      url: "http://127.0.0.1:4920/?token=inspector-cli-token",
    });
  });

  it("rejects non-local inspector binds", async () => {
    const result = await runCLI([
      "inspector",
      "serve",
      "--bind",
      "0.0.0.0",
      "--dry-run",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("only binds 127.0.0.1");
  });
});
