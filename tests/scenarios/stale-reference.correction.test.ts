import { describe, it } from "bun:test";
import { assertBehaviorScenario } from "./assert-behavior-scenario";
import { behaviorScenarios } from "./behavior-fixtures";

describe("scenario stale reference correction", () => {
  it("supersedes stale references after a user correction", async () => {
    await assertBehaviorScenario(behaviorScenarios.staleReferenceCorrection);
  });
});
