import { describe, it } from "bun:test";
import { assertBehaviorScenario } from "./assert-behavior-scenario";
import { behaviorScenarios } from "./behavior-fixtures";

describe("scenario long lifecycle change", () => {
  it("prefers the user's current role and focus after multiple lifecycle updates", async () => {
    await assertBehaviorScenario(behaviorScenarios.longLifecycleChange);
  });
});
