import { describe, expect, it } from "bun:test";
import { createInMemoryDocumentStore } from "../../src/storage/memory";
import { wrapDocumentStoreForSharedAgents } from "../../src/install/hostSharedAgentStores";
import { parseInstalledHostRuntimeConfig } from "../../src/install/hostConfigValidation";

// Opt-in cross-host read union: a host may READ records tagged with the
// agentIds it lists in sharedAgents; writes keep the writing host's agentId
// (provenance intact). Implemented as a host-layer store decorator because
// the storage filter is strict equality — agentId-less "shared" records
// would be invisible to every host scope, and dropping agentId from the
// scope would hide the host's own records behind the default scope guard.

async function seedStore() {
  const store = createInMemoryDocumentStore();
  const facts = [
    { agentId: "claude", content: "claude fact", id: "f-claude", userId: "u1" },
    { agentId: "codex", content: "codex fact", id: "f-codex", userId: "u1" },
    { agentId: "cursor", content: "cursor fact", id: "f-cursor", userId: "u1" },
    { content: "agentless fact", id: "f-agentless", userId: "u1" },
  ];
  for (const fact of facts) {
    await store.set("facts", fact.id, fact);
  }
  return store;
}

describe("wrapDocumentStoreForSharedAgents", () => {
  it("unions own and shared agent records for own-agent queries", async () => {
    const store = await seedStore();
    const wrapped = wrapDocumentStoreForSharedAgents(store, {
      ownAgentId: "claude",
      sharedAgentIds: ["codex"],
    });

    const results = await wrapped.query<{ id: string }>("facts", {
      agentId: "claude",
      userId: "u1",
    });

    expect(results.map((record) => record.id).sort()).toEqual([
      "f-claude",
      "f-codex",
    ]);
  });

  it("passes through queries for other filters unchanged", async () => {
    const store = await seedStore();
    const wrapped = wrapDocumentStoreForSharedAgents(store, {
      ownAgentId: "claude",
      sharedAgentIds: ["codex"],
    });

    // No agentId in the filter: containment semantics stay untouched.
    const all = await wrapped.query<{ id: string }>("facts", { userId: "u1" });
    expect(all).toHaveLength(4);

    // A different agentId filter is not rewritten.
    const cursorOnly = await wrapped.query<{ id: string }>("facts", {
      agentId: "cursor",
      userId: "u1",
    });
    expect(cursorOnly.map((record) => record.id)).toEqual(["f-cursor"]);
  });

  it("keeps writes attributed to the writing host", async () => {
    const store = await seedStore();
    const wrapped = wrapDocumentStoreForSharedAgents(store, {
      ownAgentId: "claude",
      sharedAgentIds: ["codex"],
    });

    await wrapped.set("facts", "f-new", {
      agentId: "claude",
      content: "new fact",
      id: "f-new",
      userId: "u1",
    });

    const raw = await store.get<{ agentId?: string }>("facts", "f-new");
    expect(raw?.agentId).toBe("claude");
  });

  it("preserves the optional conditional batch write capability", async () => {
    const store = await seedStore();
    const wrapped = wrapDocumentStoreForSharedAgents(store, {
      ownAgentId: "claude",
      sharedAgentIds: ["codex"],
    });
    // The decorator must not mask capability detection on the base store.
    expect(typeof wrapped.writeBatchIfUnchanged).toBe(
      typeof store.writeBatchIfUnchanged,
    );
  });
});
describe("sharedAgents config", () => {
  const base = {
    host: "claude" as const,
    storage: { path: "/tmp/goodmemory.sqlite", provider: "sqlite" },
    userId: "user-1",
    version: 1,
  };

  it("normalizes the list: strips self, dedupes, rejects non-strings", () => {
    const parsed = parseInstalledHostRuntimeConfig(
      { ...base, sharedAgents: ["codex", "claude", "codex", "cursor"] },
      "claude",
    );
    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") {
      return;
    }
    expect(parsed.config.sharedAgents).toEqual(["codex", "cursor"]);

    const absent = parseInstalledHostRuntimeConfig(base, "claude");
    expect(absent.status).toBe("ok");
    if (absent.status !== "ok") {
      return;
    }
    expect("sharedAgents" in absent.config).toBe(false);

    expect(
      parseInstalledHostRuntimeConfig({ ...base, sharedAgents: ["", 3] }, "claude"),
    ).toEqual({
      detail: "sharedAgents must be an array of non-empty strings",
      status: "invalid",
    });
    expect(
      parseInstalledHostRuntimeConfig({ ...base, sharedAgents: "codex" }, "claude"),
    ).toEqual({
      detail: "sharedAgents must be an array of non-empty strings",
      status: "invalid",
    });
  });
});
