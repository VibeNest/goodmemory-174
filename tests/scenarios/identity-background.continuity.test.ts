import { describe, it } from "bun:test";
import { assertBehaviorScenario } from "./assert-behavior-scenario";
import { behaviorScenarios } from "./behavior-fixtures";

describe("scenario identity continuity", () => {
  it("preserves identity, role, and response style across sessions", async () => {
    await assertBehaviorScenario(behaviorScenarios.identityContinuity);
  });
});
