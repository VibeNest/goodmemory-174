import { afterEach } from "bun:test";

import { activateLegacyFittedEvalProfile } from "../../scripts/eval-profiles/legacy-fitted/activate";
import "./test-env";

activateLegacyFittedEvalProfile();

afterEach(() => {
  activateLegacyFittedEvalProfile();
});
