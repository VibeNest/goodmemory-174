import { describe, expect, it } from "bun:test";
import {
  createGoodMemory,
  createNeutralLanguagePack,
  type LanguagePack,
} from "../../src";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
} from "../../src/storage/memory";

describe("public feedback API", () => {
  it("normalizes persisted feedback with its own language pack", async () => {
    const base = createNeutralLanguagePack();
    const sourcePack: LanguagePack = {
      ...base,
      compatibilityGroup: "test-canonical",
      defaultLocale: "eo",
      id: "test-source",
      locales: ["eo"],
      normalizeForEquality: (text) => text.toLowerCase().replaceAll("colour", "color"),
    };
    const incomingPack: LanguagePack = {
      ...base,
      compatibilityGroup: "test-canonical",
      defaultLocale: "vo",
      id: "test-incoming",
      locales: ["vo"],
      normalizeForEquality: (text) => text.toLowerCase(),
    };
    const memory = createGoodMemory({
      language: { packs: [sourcePack, incomingPack] },
      storage: { provider: "memory" },
    });
    const scope = { userId: "u-language-pack", workspaceId: "workspace-a" };

    const first = await memory.feedback({ locale: "eo", scope, signal: "colour" });
    const second = await memory.feedback({ locale: "vo", scope, signal: "color" });

    expect(first.outcome).toBe("written");
    expect(second.outcome).toBe("merged");
    expect(second.memoryId).toBe(first.memoryId);
  });

  it("writes procedural memory without going through remember()", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });

    const result = await memory.feedback({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      signal: "Please keep answers concise and action-oriented.",
    });

    expect(result.accepted).toBe(true);
    expect(result.outcome).toBe("written");
    expect(result.memoryId).toBeDefined();
    expect(result.kind).toBe("do");
    expect(
      await documentStore.query("feedback", {
        userId: "u-1",
        workspaceId: "workspace-a",
      }),
    ).toHaveLength(1);
  });

  it("records validated patterns separately when the user confirms a successful style", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });

    await memory.feedback({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      signal: "The checklist format worked well for me, keep using it for code reviews.",
    });
    await memory.feedback({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-2" },
      signal: "The checklist format worked well for me, keep using it for code reviews.",
    });

    const records = await documentStore.query<{ kind: string }>("feedback", {
      userId: "u-1",
      workspaceId: "workspace-a",
    });
    expect(records.some((record) => record.kind === "validated_pattern")).toBe(true);
  });

  it("normalizes and stores Chinese feedback signals", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });

    const result = await memory.feedback({
      scope: { userId: "u-zh", workspaceId: "workspace-a", sessionId: "s-1" },
      signal: "请以后优先用要点列表回复。",
    });

    expect(result.kind).toBe("prefer");
    expect(result.metadata?.locale).toBe("zh-CN");
    expect(
      await documentStore.query("feedback", {
        userId: "u-zh",
        workspaceId: "workspace-a",
      }),
    ).toHaveLength(1);
  });

  it("surfaces proposal and promotion receipts on public feedback() when evolution produces them", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });
    const scope = { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" } as const;

    const first = await memory.feedback({
      scope,
      signal: "Use bullet points in summaries.",
    });
    const second = await memory.feedback({
      scope,
      signal: "Use bullet points in summaries.",
    });

    const exported = await memory.exportMemory({
      scope: { userId: "u-1", workspaceId: "workspace-a" },
    });

    const receiptBearingResult = [first, second].find(
      (result) =>
        (result.proposalReceipts?.length ?? 0) > 0 ||
        (result.promotionReceipts?.length ?? 0) > 0,
    );

    expect(receiptBearingResult?.proposalReceipts).toHaveLength(1);
    expect(receiptBearingResult?.proposalReceipts?.[0]?.proposalType).toBe(
      "procedural_pattern",
    );
    expect(receiptBearingResult?.promotionReceipts).toHaveLength(1);
    expect(receiptBearingResult?.promotionReceipts?.[0]?.decision).toBe("accepted");
    expect(exported.durable.proposals).toHaveLength(1);
    expect(exported.durable.promotions).toHaveLength(1);
  });
});
