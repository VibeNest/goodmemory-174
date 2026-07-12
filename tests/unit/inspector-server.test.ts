import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync } from "node:zlib";

import { createGoodMemory } from "../../src/api/createGoodMemory";
import {
  createInspectorApp,
  normalizeInspectorBindHost,
  serveInspector,
} from "../../src/inspector/public";
import { createInMemoryDocumentStore } from "../../src/storage/memory";

const TOKEN = "inspector-server-token";
let homeRoot: string;
let webRoot: string;

beforeEach(async () => {
  homeRoot = await mkdtemp(join(tmpdir(), "goodmemory-inspector-server-"));
  webRoot = join(homeRoot, "web");
  await mkdir(join(webRoot, "assets"), { recursive: true });
  await writeFile(
    join(webRoot, "index.html"),
    "<!doctype html><title>GoodMemory Inspector</title><div id=\"root\"></div>",
  );
  await writeFile(join(webRoot, "assets", "app.js"), "console.log('inspector')");
  await writeFile(
    join(webRoot, "assets", "compressed.js.br"),
    brotliCompressSync("console.log('compressed')"),
  );
});

afterEach(async () => {
  await rm(homeRoot, { force: true, recursive: true });
});

describe("Inspector server", () => {
  it("only accepts the loopback bind", () => {
    expect(normalizeInspectorBindHost(undefined)).toBe("127.0.0.1");
    expect(normalizeInspectorBindHost("127.0.0.1")).toBe("127.0.0.1");
    expect(() => normalizeInspectorBindHost("0.0.0.0")).toThrow(
      "only binds 127.0.0.1",
    );
  });

  it("rejects short tokens", () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({ adapters: { documentStore } });
    expect(() =>
      createInspectorApp({ documentStore, memory, token: "short", webRoot }),
    ).toThrow("at least 12 characters");
  });

  it("rejects tokens with surrounding whitespace", () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({ adapters: { documentStore } });
    expect(() =>
      createInspectorApp({
        documentStore,
        memory,
        token: ` ${TOKEN} `,
        webRoot,
      }),
    ).toThrow("surrounding whitespace");
  });

  it("serves the SPA publicly but keeps Admin API Bearer-gated", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({ adapters: { documentStore } });
    const app = createInspectorApp({
      documentStore,
      memory,
      token: TOKEN,
      webRoot,
    });

    const shell = await app.fetch(new Request("http://localhost/scopes/demo/memories"));
    expect(shell.status).toBe(200);
    expect(await shell.text()).toContain("GoodMemory Inspector");

    const unauthorized = await app.fetch(
      new Request(`http://localhost/admin/v1/scopes?token=${TOKEN}`),
    );
    expect(unauthorized.status).toBe(401);

    const method = await app.fetch(
      new Request("http://localhost/", { method: "POST" }),
    );
    expect(method.status).toBe(405);
  });

  it("serves Brotli-only assets with a deterministic identity fallback", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({ adapters: { documentStore } });
    const app = createInspectorApp({
      documentStore,
      memory,
      token: TOKEN,
      webRoot,
    });

    const identity = await app.fetch(
      new Request("http://localhost/assets/compressed.js"),
    );
    expect(identity.status).toBe(200);
    expect(identity.headers.get("content-encoding")).toBeNull();
    expect(await identity.text()).toBe("console.log('compressed')");

    const compressed = await app.fetch(
      new Request("http://localhost/assets/compressed.js", {
        headers: { "accept-encoding": "gzip, br" },
      }),
    );
    expect(compressed.status).toBe(200);
    expect(compressed.headers.get("content-encoding")).toBe("br");
    expect(compressed.headers.get("vary")).toBe("Accept-Encoding");
    expect(Buffer.from(await compressed.arrayBuffer())).toEqual(
      brotliCompressSync("console.log('compressed')"),
    );
  });

  it("rejects malformed encoded asset paths without throwing", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({ adapters: { documentStore } });
    const app = createInspectorApp({
      documentStore,
      memory,
      token: TOKEN,
      webRoot,
    });

    const response = await app.fetch(
      new Request("http://localhost/assets/%E0%A4%A"),
    );
    expect(response.status).toBe(404);
  });

  it("serves over a real loopback socket and returns a fragment token URL", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({ adapters: { documentStore } });
    const handle = serveInspector({
      documentStore,
      memory,
      token: TOKEN,
      webRoot,
    });
    try {
      expect(handle.bindHost).toBe("127.0.0.1");
      expect(handle.url).toBe(
        `http://127.0.0.1:${handle.port}/#token=${TOKEN}`,
      );
      const response = await fetch(
        `http://127.0.0.1:${handle.port}/admin/v1/descriptor`,
        { headers: { authorization: `Bearer ${TOKEN}` } },
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        data: { mutationRoutes: true, readOnly: false },
      });
    } finally {
      handle.stop();
    }
  });
});
