// Release examples smoke. Runs the runnable entry points of the public examples
// against in-memory GoodMemory (no ports, no network). Because this test lives
// under tests/ (which IS in the tsconfig include, unlike examples/), importing
// the example modules here also pulls them into `bun run typecheck`, so example
// API drift is caught at the release gate.
import { describe, expect, it } from "bun:test";
import { runBasicChatExample } from "../../examples/basic-chat";
import { runMultiHopRecallExample } from "../../examples/multihop-recall";
import { runPlainAISDKServerExample } from "../../examples/plain-ai-sdk-server";
import { runReferenceProductSmoke } from "../../examples/reference-chat-product/backend";

describe("release examples smoke", () => {
  it("basic-chat runs end to end and produces context + export artifacts", async () => {
    const result = await runBasicChatExample();
    expect(result.memoryContext.length).toBeGreaterThan(0);
    expect(result.answer.length).toBeGreaterThan(0);
    expect(result.artifacts.files.length).toBeGreaterThan(0);
  });

  it("plain AI SDK server handles two turns without binding a port", async () => {
    const result = await runPlainAISDKServerExample();
    expect(result.firstResponseText.length).toBeGreaterThan(0);
    expect(result.secondResponseText.length).toBeGreaterThan(0);
    expect(result.events.length).toBeGreaterThan(0);
  });

  it("reference chat product backend remembers then recalls in-memory", async () => {
    const result = await runReferenceProductSmoke();
    expect(result.rememberAccepted).toBe(true);
    expect(result.hasContext).toBe(true);
    expect(result.itemCount).toBeGreaterThan(0);
  });

  it("multi-hop recall example surfaces the bridge fact via opt-in multiHop", async () => {
    const result = await runMultiHopRecallExample();
    // The answer ("Bob") lives one hop from the question's named subject.
    expect(result.multiHopContext).toContain("Bob");
    expect(result.singleHopContext.length).toBeGreaterThan(0);
  });
});
