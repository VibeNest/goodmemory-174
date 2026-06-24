// Opt-in multi-hop recall over bridge entities.
//
// This example shows the `multiHop` recall option, nothing more. It is NOT a
// demonstration of semantic reasoning: GoodMemory recall stays lexical. `multiHop`
// simply runs a second retrieval pass after extracting the bridge entities named
// in the first pass, so a question whose answer lives one hop away from the named
// subject can still surface the needed fact.
//
// Default recall is single-pass. `multiHop` is opt-in and can add noise when the
// first pass is weak, so reach for it only when the first hop reliably names the
// bridge entity the second hop needs.
//
//   bun run examples/multihop-recall.ts
import { createGoodMemory } from "goodmemory";

export async function runMultiHopRecallExample(): Promise<{
  multiHopContext: string;
  singleHopContext: string;
}> {
  const memory = createGoodMemory({
    storage: { provider: "memory" },
  });

  const scope = {
    userId: "example-user",
    sessionId: "multihop-s1",
    workspaceId: "example-multihop",
  };

  // Two facts where the answer is one hop from the question's named subject:
  // the question names "Alice"; the answer ("Bob") is attached to the bridge
  // entity ("Project Atlas") that only the first fact names.
  await memory.remember({
    scope,
    messages: [
      { role: "user", content: "Alice started Project Atlas last quarter." },
      { role: "user", content: "Project Atlas is managed day-to-day by Bob." },
    ],
    // Confirm both statements as durable facts (a product would do this after a
    // user/host confirmation) so they are retrievable below.
    annotations: [
      { messageIndex: 0, remember: "always", kindHint: "fact" },
      { messageIndex: 1, remember: "always", kindHint: "fact" },
    ],
  });

  const query = "Who manages the project Alice started?";
  const recallScope = { ...scope, sessionId: "multihop-s2" };

  // Single-pass (default) recall: only the first hop's subject is matched.
  const singleHop = await memory.recall({ scope: recallScope, query });
  const singleHopContext = (
    await memory.buildContext({ recall: singleHop, output: "markdown", maxTokens: 160 })
  ).content;

  // Opt-in multi-hop recall: pass 1 names "Project Atlas", pass 2 expands the
  // query with that bridge entity and surfaces the "managed by Bob" fact. On a
  // store this small both passes return the same facts; multi-hop's benefit shows
  // only under distractor pressure, where the bridge fact would otherwise fall
  // below the single-pass cutoff.
  const multiHop = await memory.recall({ scope: recallScope, query, multiHop: true });
  const multiHopContext = (
    await memory.buildContext({ recall: multiHop, output: "markdown", maxTokens: 160 })
  ).content;

  return { multiHopContext, singleHopContext };
}

if (import.meta.main) {
  const result = await runMultiHopRecallExample();
  console.log(JSON.stringify(result, null, 2));
}
