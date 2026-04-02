import { describe, it } from "bun:test";
import { assertBehaviorScenario } from "./assert-behavior-scenario";
import { behaviorScenarios } from "./behavior-fixtures";

describe("scenario open-loop continuation", () => {
  it("carries unresolved work forward into the next session", async () => {
    await assertBehaviorScenario(behaviorScenarios.openLoopContinuation);
  });
});
