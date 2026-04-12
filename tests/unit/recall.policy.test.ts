import { describe, expect, it } from "bun:test";
import { createUserProfile } from "../../src/domain/records";
import {
  applyRecallPolicyToProfile,
  applyRecallPolicyToRecords,
  reconcileCandidateTraces,
} from "../../src/recall/policy";

const SCOPED_CONTEXT = {
  userId: "user-1",
  workspaceId: "workspace-1",
};

describe("recall policy helpers", () => {
  it("records default scope guard drops for narrower records", async () => {
    const policyApplied = new Set<string>();

    const records = await applyRecallPolicyToRecords(
      [{ id: "fact-1", workspaceId: "workspace-2" }],
      "fact",
      {
        scope: { userId: "user-1" },
        query: "What changed?",
        retrievalProfile: "general_chat",
        locale: "en",
        localeSource: "default",
        policyApplied,
      },
    );

    expect(records).toEqual([]);
    expect([...policyApplied]).toContain("default_scope_guard");
  });

  it("lets custom policy suppress the profile", async () => {
    const policyApplied = new Set<string>();
    const profile = createUserProfile({
      userId: "user-1",
      identity: { role: "Staff Engineer" },
    });

    const result = await applyRecallPolicyToProfile(profile, {
      scope: SCOPED_CONTEXT,
      query: "Who am I?",
      retrievalProfile: "general_chat",
      locale: "en",
      localeSource: "default",
      policyApplied,
      policy: {
        async shouldRecall() {
          return false;
        },
      },
    });

    expect(result).toBeNull();
    expect([...policyApplied]).toContain("custom_shouldRecall");
  });

  it("reconciles returned traces that are filtered later", () => {
    const traces = reconcileCandidateTraces(
      [
        {
          memoryId: "fact-1",
          memoryType: "fact",
          slot: "generic",
          returned: true,
          whyReturned: "selected",
          intentScore: 0.5,
          lexicalScore: 0.4,
          freshnessScore: 0.25,
          explicitnessScore: 0.15,
          fallback: "none",
        },
      ],
      new Set<string>(),
    );

    expect(traces[0]?.returned).toBe(false);
    expect(traces[0]?.whySuppressed).toBe("policy filtered");
    expect(traces[0]?.whyReturned).toBeUndefined();
  });
});
