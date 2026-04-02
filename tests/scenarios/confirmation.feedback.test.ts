import { describe, it } from "bun:test";
import { assertBehaviorScenario } from "./assert-behavior-scenario";
import { behaviorScenarios } from "./behavior-fixtures";

describe("scenario confirmation feedback", () => {
  it("applies confirmed procedural feedback to later responses", async () => {
    await assertBehaviorScenario(behaviorScenarios.confirmationFeedback);
  });
});
