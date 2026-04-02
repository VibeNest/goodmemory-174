import { describe, it } from "bun:test";
import { assertBehaviorScenario } from "./assert-behavior-scenario";
import { behaviorScenarios } from "./behavior-fixtures";

describe("scenario scope isolation", () => {
  it("does not leak workspace-specific memory into another workspace recall", async () => {
    await assertBehaviorScenario(behaviorScenarios.scopeIsolation);
  });
});
