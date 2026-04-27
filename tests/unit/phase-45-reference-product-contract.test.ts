import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";

const ROOT = join(import.meta.dir, "../..");
const REFERENCE_PRODUCT_DIR = join(ROOT, "examples/reference-chat-product");

describe("phase-45 reference product contract", () => {
  it("keeps the reference product on public package and bridge surfaces", async () => {
    const backend = await readFile(join(REFERENCE_PRODUCT_DIR, "backend.ts"), "utf8");
    const fastapiBackend = await readFile(
      join(REFERENCE_PRODUCT_DIR, "fastapi_backend.py"),
      "utf8",
    );

    expect(backend).toContain('from "goodmemory"');
    expect(backend).toContain('from "goodmemory/http"');
    expect(backend).not.toContain("../src/");
    expect(backend).not.toContain("../../src/");
    expect(backend).not.toContain("src/runtime-viewer");
    expect(fastapiBackend).toContain("GOODMEMORY_BRIDGE_URL");
    expect(fastapiBackend).toContain("/memory/recall-context");
    expect(fastapiBackend).toContain("summarize_export(");
    expect(fastapiBackend).not.toContain("../src/");
    expect(fastapiBackend).not.toContain("../../src/");
    expect(fastapiBackend).not.toContain('return post_bridge("/memory/export"');
  });

  it("registers documented startup commands without widening the root API", async () => {
    const packageJson = JSON.parse(
      await readFile(join(ROOT, "package.json"), "utf8"),
    ) as {
      exports?: Record<string, unknown>;
      scripts?: Record<string, string>;
    };
    const rootSource = await readFile(join(ROOT, "src/index.ts"), "utf8");
    const docs = await readFile(join(REFERENCE_PRODUCT_DIR, "README.md"), "utf8");

    expect(packageJson.scripts?.["example:reference-product"]).toBe(
      "bun run examples/reference-chat-product/backend.ts smoke",
    );
    if (packageJson.scripts?.["eval:phase-45"] !== undefined) {
      expect(packageJson.scripts["eval:phase-45"]).toBe(
        "bun run scripts/run-phase-45-adoption-eval.ts",
      );
    }
    if (packageJson.scripts?.["gate:phase-45"] !== undefined) {
      expect(packageJson.scripts["gate:phase-45"]).toBe(
        "bun run scripts/run-phase-45-gate.ts",
      );
    }
    expect(Object.keys(packageJson.exports ?? {})).not.toContain("./reference-product");
    expect(rootSource).not.toContain("reference-chat-product");
    expect(rootSource).not.toContain("runPhase45");
    expect(docs).toContain("bun run example:reference-product");
    expect(docs).toContain("goodmemory-http-bridge");
  });

  it("inherits Phase 44 viewer boundaries while allowing product backend mutations", async () => {
    const backend = await readFile(join(REFERENCE_PRODUCT_DIR, "backend.ts"), "utf8");
    const docs = await readFile(join(REFERENCE_PRODUCT_DIR, "README.md"), "utf8");
    const viewerSource = await readFile(join(ROOT, "src/runtime-viewer/public.ts"), "utf8");

    expect(backend).toContain("/memory/remember");
    expect(backend).toContain("/memory/feedback");
    expect(backend).toContain("/memory/export");
    expect(backend).toContain("/memory/forget");
    expect(backend).toContain("/memory/revise");
    expect(docs).toContain("viewer remains read-only");
    expect(docs).toContain("CLI/API handoff");
    expect(viewerSource).toContain("GoodMemory runtime viewer is read-only");
    expect(viewerSource).not.toContain("access-control-allow-origin");
  });

  it("keeps FastAPI product idempotency durable with stable keys", async () => {
    const fastapiBackend = await readFile(
      join(REFERENCE_PRODUCT_DIR, "fastapi_backend.py"),
      "utf8",
    );

    expect(fastapiBackend).toContain("hashlib.sha256");
    expect(fastapiBackend).toContain("import sqlite3");
    expect(fastapiBackend).toContain("turn_id: str");
    expect(fastapiBackend).toContain("event_id: str");
    expect(fastapiBackend).toContain("GOODMEMORY_REFERENCE_PRODUCT_STATE_PATH");
    expect(fastapiBackend).toContain("CREATE TABLE IF NOT EXISTS product_idempotency");
    expect(fastapiBackend).toContain("response_json TEXT");
    expect(fastapiBackend).toContain("sqlite3.connect(");
    expect(fastapiBackend).toContain("BEGIN IMMEDIATE");
    expect(fastapiBackend).toContain("reserve_chat_turn(");
    expect(fastapiBackend).toContain("complete_chat_turn(");
    expect(fastapiBackend).toContain("reserve_remember_write(");
    expect(fastapiBackend).toContain("reserve_operation(");
    expect(fastapiBackend).toContain("complete_remember_reservation(");
    expect(fastapiBackend).toContain("fail_remember_reservation(");
    expect(fastapiBackend).toContain("complete_operation(");
    expect(fastapiBackend).toContain("fail_operation(");
    expect(fastapiBackend).toContain("json.dumps(response");
    expect(fastapiBackend).toContain("json.loads(response_json)");
    expect(fastapiBackend).toContain('state == "failed"');
    expect(fastapiBackend).toContain("stable_key(");
    expect(fastapiBackend).toContain('f"fastapi-chat-{request.turn_id}"');
    expect(fastapiBackend).toContain('f"fastapi-feedback-{request.event_id}"');
    expect(fastapiBackend).toContain('f"{request.memory_id}:{request.content}"');
    expect(fastapiBackend).not.toContain("threading.Condition");
    expect(fastapiBackend).not.toContain("REMEMBER_IDEMPOTENCY");
    expect(fastapiBackend).not.toContain("FEEDBACK_IDEMPOTENCY");
    expect(fastapiBackend).not.toContain("hash(request.");
    expect(fastapiBackend).not.toContain('stable_key("fastapi-chat", request.message)');
    expect(fastapiBackend).not.toContain('stable_key("fastapi-feedback", request.signal)');
    expect(fastapiBackend).not.toContain("reset_failed_remember_reservation(");
    expect(fastapiBackend).not.toContain('f"fastapi-revise-{request.memory_id}"');
    expect(
      fastapiBackend.indexOf("reserved, cached_response = reserve_chat_turn("),
    ).toBeLessThan(
      fastapiBackend.indexOf('recall = post_bridge("/memory/recall-context"'),
    );
  });
});
