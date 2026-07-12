#!/usr/bin/env bun
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

import { createGoodMemory } from "../src/api/createGoodMemory";
import { scopeToKey } from "../src/domain/scope";
import { serveInspector } from "../src/inspector/public";
import { persistReviewCandidates } from "../src/install/hostReviewQueue";
import {
  createSQLiteDocumentStore,
  createSQLiteSessionStore,
  createSQLiteVectorStore,
} from "../src/storage/sqlite";

const root = resolve(
  process.env.GOODMEMORY_PHASE71_FIXTURE_ROOT ??
    "/tmp/goodmemory-phase71-inspector",
);
const databasePath = join(root, "inspector.sqlite");
const homeRoot = join(root, "home");
const port = Number(process.env.GOODMEMORY_PHASE71_FIXTURE_PORT ?? "4781");
const token =
  process.env.GOODMEMORY_PHASE71_FIXTURE_TOKEN ?? "phase71-browser-token";
const reset = process.env.GOODMEMORY_PHASE71_FIXTURE_RESET !== "false";

if (reset) {
  await rm(root, { force: true, recursive: true });
}
await mkdir(root, { recursive: true });

const documentStore = createSQLiteDocumentStore(databasePath);
const sessionStore = createSQLiteSessionStore(databasePath);
const vectorStore = createSQLiteVectorStore(databasePath);
const primaryScope = {
  tenantId: "acme",
  userId: "mira.chen",
  workspaceId: "memory-platform",
};
const secondaryScope = {
  tenantId: "acme",
  userId: "jon.bell",
  workspaceId: "support-ops",
};

await documentStore.set("facts", "fact-release-window", {
  ...primaryScope,
  accessCount: 2,
  category: "project",
  confidence: 0.96,
  content: "The v0.6 release window starts after the external benchmark gate passes.",
  createdAt: "2026-07-08T16:00:00.000Z",
  id: "fact-release-window",
  importance: 0.9,
  isActive: true,
  lifecycle: "active",
  source: {
    extractedAt: "2026-07-08T16:00:00.000Z",
    method: "explicit",
  },
  updatedAt: "2026-07-10T18:30:00.000Z",
});
await documentStore.set("facts", "fact-reranker-model", {
  ...primaryScope,
  accessCount: 1,
  category: "project",
  confidence: 1,
  content: "Non-judge LLM calls use gpt-5.6-terra through the Gurki gateway.",
  createdAt: "2026-07-10T20:00:00.000Z",
  id: "fact-reranker-model",
  importance: 1,
  isActive: true,
  lifecycle: "active",
  source: {
    extractedAt: "2026-07-10T20:00:00.000Z",
    method: "explicit",
  },
  updatedAt: "2026-07-10T20:00:00.000Z",
});
await documentStore.set("preferences", "preference-status-format", {
  ...primaryScope,
  category: "communication",
  confidence: 0.93,
  createdAt: "2026-07-09T10:00:00.000Z",
  id: "preference-status-format",
  lifecycle: "active",
  source: {
    extractedAt: "2026-07-09T10:00:00.000Z",
    method: "explicit",
  },
  strength: 0.9,
  updatedAt: "2026-07-09T10:00:00.000Z",
  value: "Use compact benchmark status summaries with exact evidence links.",
});
await documentStore.set("facts", "fact-support-hours", {
  ...secondaryScope,
  accessCount: 0,
  category: "operations",
  confidence: 0.88,
  content: "Support coverage starts at 08:00 Pacific time.",
  createdAt: "2026-07-07T15:00:00.000Z",
  id: "fact-support-hours",
  importance: 0.6,
  isActive: true,
  lifecycle: "active",
  source: {
    extractedAt: "2026-07-07T15:00:00.000Z",
    method: "explicit",
  },
  updatedAt: "2026-07-07T15:00:00.000Z",
});

if (process.env.GOODMEMORY_PHASE71_FIXTURE_PAGINATION === "1") {
  for (let index = 0; index < 55; index += 1) {
    const suffix = String(index).padStart(2, "0");
    await documentStore.set("facts", `fact-pagination-${suffix}`, {
      ...primaryScope,
      accessCount: 0,
      category: "project",
      confidence: 1,
      content: `Pagination fixture memory ${suffix}.`,
      createdAt: "2026-07-11T18:00:00.000Z",
      id: `fact-pagination-${suffix}`,
      importance: 0.1,
      isActive: true,
      lifecycle: "active",
      source: {
        extractedAt: "2026-07-11T18:00:00.000Z",
        method: "explicit",
      },
      updatedAt: "2026-07-11T18:00:00.000Z",
    });
  }
}

await persistReviewCandidates({
  candidates: [
    {
      candidateKey: "browser-approve",
      confidence: 0.94,
      content: "Mira prefers benchmark updates grouped by protocol and confidence.",
      host: "codex",
      kind: "preference",
      reason: "Repeated explicit formatting preference.",
      scope: primaryScope,
      source: "user",
    },
    {
      candidateKey: "browser-reject",
      confidence: 0.58,
      content: "Mira may want every diagnostic included in public claims.",
      host: "codex",
      kind: "preference",
      reason: "Inferred from one ambiguous turn.",
      scope: primaryScope,
      source: "user",
    },
  ],
  homeRoot,
  now: () => new Date("2026-07-11T18:00:00.000Z"),
});

const memory = createGoodMemory({
  adapters: {
    assistedExtractor: {
      async extract() {
        return { candidates: [], ignoredMessageCount: 0 };
      },
    },
    documentStore,
    embeddingAdapter: {
      async embed(texts) {
        return texts.map(() => [1, 0, 0]);
      },
    },
    sessionStore,
    vectorStore,
  },
  retrieval: { preset: "recommended" },
});
const server = serveInspector({
  documentStore,
  homeRoot,
  memory,
  port,
  token,
});

console.log(JSON.stringify({
  databasePath,
  homeRoot,
  primaryScopeKey: scopeToKey(primaryScope),
  secondaryScopeKey: scopeToKey(secondaryScope),
  url: server.url,
}));

const stop = () => {
  server.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
await new Promise(() => {});
