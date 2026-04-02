import { describe, expect, it } from "bun:test";
import { createScenarioReplayHarness } from "../../src/testing/scenarioReplay";

describe("scenario replay harness smoke", () => {
  it("replays a minimal multi-turn conversation", async () => {
    const harness = createScenarioReplayHarness({
      personaId: "smoke-persona",
      sessions: [
        {
          sessionId: "s-1",
          turns: [
            { role: "user", content: "Remember that I am a robotics engineer." },
            { role: "assistant", content: "Noted." },
          ],
        },
      ],
    });

    const turns: string[] = [];

    for await (const turn of harness.replay()) {
      turns.push(`${turn.sessionId}:${turn.turnIndex}:${turn.role}`);
    }

    expect(turns).toEqual(["s-1:0:user", "s-1:1:assistant"]);
  });
});
