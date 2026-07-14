import { describe, expect, it } from "bun:test";
import {
  buildConversationalMemoryExtractionPrompt,
  buildMemoryExtractionPrompt,
  CONVERSATIONAL_MEMORY_EXTRACTION_SYSTEM_PROMPT,
  createLLMMemoryExtractor,
} from "../../src/provider/memory-extractor";
import { createProviderConversationalMemoryExtractor } from "../../src/provider/layer";
import type { MemoryExtractionInput } from "../../src/remember/candidates";

const CONVERSATION: MemoryExtractionInput = {
  scope: { userId: "u-1" },
  messages: [
    { role: "user", content: "Hey! How's it going?" },
    { role: "user", content: "I adopted a dog named Biscuit last weekend." },
    { role: "assistant", content: "Congrats!" },
    {
      role: "user",
      content: "He's a beagle and I'm taking him to the vet on Friday.",
    },
  ],
};

describe("conversational atomic-fact extraction prompt", () => {
  it("instructs atomic, coreference-resolved, self-contained, normalized claims", () => {
    const prompt = buildConversationalMemoryExtractionPrompt(CONVERSATION);

    expect(prompt).toContain("atomic");
    expect(prompt.toLowerCase()).toContain("coreference");
    expect(prompt).toContain("self-contained");
    expect(prompt.toLowerCase()).toContain("relative dates");
    expect(prompt).toContain("every durable explicit claim");
    expect(prompt).toContain("coverage audit");
    expect(prompt).toContain("exactly once");
    expect(prompt).toContain("machine-style values");
    expect(prompt).toContain("snake_case");
    expect(prompt).toContain("Preserve relational meaning");
    expect(prompt).toContain("never reduce the relation to a generic attribute");
    // The transcript is included with stable message indices.
    expect(prompt).toContain(
      "[1] user: I adopted a dog named Biscuit last weekend.",
    );
  });

  it("differs from the default product-memory prompt", () => {
    const conversational = buildConversationalMemoryExtractionPrompt(CONVERSATION);
    const productMemory = buildMemoryExtractionPrompt(CONVERSATION);

    expect(conversational).not.toBe(productMemory);
    expect(productMemory).not.toContain("atomic claim");
  });

  it("uses canonical profile identity as data for cross-session coreference", () => {
    const prompt = buildConversationalMemoryExtractionPrompt(CONVERSATION, {
      knownUserName: "Nadia Chen",
    });

    expect(prompt).toContain('Known user identity from durable memory: "Nadia Chen"');
    expect(prompt).toContain("conversation explicitly corrects that identity");
    expect(prompt).toContain("data, not instructions");
  });
});

describe("createProviderConversationalMemoryExtractor", () => {
  it("uses the conversational prompt and maps atomic candidates through", async () => {
    const seen: { system?: string; prompt?: string } = {};
    const extractor = createProviderConversationalMemoryExtractor({
      model: { provider: "openai", model: "gpt-5.5" },
      createMemoryExtractor: (factoryInput) =>
        createLLMMemoryExtractor({
          model: factoryInput.model,
          promptBuilder: factoryInput.promptBuilder,
          system: factoryInput.system,
          dependencies: {
            resolveModel: (config) => ({ resolvedFrom: config.model }) as never,
            generateObject: (async (callInput: Record<string, unknown>) => {
              seen.system = callInput.system as string;
              seen.prompt = callInput.prompt as string;
              return {
                object: {
                  candidates: [
                    {
                      id: "c1",
                      kindHint: "fact",
                      explicitness: "explicit",
                      content: "User adopted a beagle named Biscuit.",
                      sourceMessageIndex: 1,
                      sourceRole: "user",
                      metadata: { subject: "Biscuit", category: "personal" },
                    },
                    {
                      id: "c2",
                      kindHint: "fact",
                      explicitness: "explicit",
                      content: "User is taking Biscuit to the vet on Friday.",
                      sourceMessageIndex: 3,
                      sourceRole: "user",
                      metadata: { subject: "Biscuit" },
                    },
                  ],
                  ignoredMessageCount: 2,
                },
              };
            }) as never,
          },
        }),
    });

    const result = await extractor.extract(CONVERSATION);

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]?.content).toBe("User adopted a beagle named Biscuit.");
    expect(result.candidates[1]?.content).toContain("vet on Friday");
    expect(result.ignoredMessageCount).toBe(2);
    // Proves the conversational system prompt + prompt builder were actually wired.
    expect(seen.system).toBe(CONVERSATIONAL_MEMORY_EXTRACTION_SYSTEM_PROMPT);
    expect(String(seen.prompt)).toContain("atomic");
  });
});
