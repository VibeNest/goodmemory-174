import { describe, expect, it } from "bun:test";
import { runCLI } from "../../src/cli";

describe("runtime viewer CLI", () => {
  it("renders runtime viewer help", async () => {
    const result = await runCLI(["runtime", "viewer", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "goodmemory runtime viewer --host <codex|claude> --port <n>",
    );
    expect(result.stdout).toContain("binds 127.0.0.1 only");
    expect(result.stdout).toContain("read-only API");
  });

  it("prints local dry-run configuration without starting a server", async () => {
    const result = await runCLI([
      "runtime",
      "viewer",
      "--host",
      "codex",
      "--port",
      "4919",
      "--token",
      "viewer-cli-token",
      "--dry-run",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      bindHost: "127.0.0.1",
      cors: false,
      host: "codex",
      mutationRoutes: false,
      port: 4919,
      readOnly: true,
      rawTranscript: false,
      token: "viewer-cli-token",
      tokenRequired: true,
      url: "http://127.0.0.1:4919/#token=viewer-cli-token",
    });
  });

  it("rejects non-local viewer binds", async () => {
    const result = await runCLI([
      "runtime",
      "viewer",
      "--host",
      "codex",
      "--bind",
      "0.0.0.0",
      "--dry-run",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("only binds 127.0.0.1");
  });
});
