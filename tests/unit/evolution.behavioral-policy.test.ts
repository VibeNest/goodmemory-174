import { describe, expect, it } from "bun:test";
import { createFeedbackMemory } from "../../src/domain/records";
import { createMemorySource } from "../../src/domain/provenance";
import {
  behavioralPolicyActionSatisfiesCanonical,
  attachBehavioralPolicyAttributes,
  buildBehavioralActionSteeringLines,
  buildBehavioralSteeringLines,
  deriveRuleBehavioralPolicy,
  readBehavioralPolicyFromFeedbackMemory,
  selectBehavioralPolicies,
} from "../../src/evolution/behavioralPolicy";

const source = createMemorySource({
  method: "explicit",
  extractedAt: "2026-04-30T00:00:00.000Z",
  sessionId: "s-1",
});

describe("behavioral policy", () => {
  it("round-trips a typed behavioral policy through feedback attributes", () => {
    const feedback = createFeedbackMemory({
      id: "feedback-1",
      userId: "u-1",
      workspaceId: "ws-1",
      sessionId: "s-1",
      kind: "validated_pattern",
      rule: "Use the canonical host action first.",
      attributes: attachBehavioralPolicyAttributes(undefined, {
        behavioralKind: "first_action",
        enactmentSurface: "host_action",
        applicability: {
          appliesTo: "coding_agent",
          canonicalFirstAction: {
            kind: "tool_call",
            name: "QuickCheck",
            raw: "QuickCheck --network",
          },
          queryContains: ["detailed analysis"],
        },
        transferMode: "pattern_bounded",
      }),
      source,
      updatedAt: source.extractedAt,
    });

    expect(readBehavioralPolicyFromFeedbackMemory(feedback)).toEqual({
      behavioralKind: "first_action",
      enactmentSurface: "host_action",
      applicability: {
        appliesTo: "coding_agent",
        canonicalFirstAction: {
          kind: "tool_call",
          name: "QuickCheck",
          raw: "QuickCheck --network",
        },
        queryContains: ["detailed analysis"],
      },
      transferMode: "pattern_bounded",
    });
  });

  it("classifies a single exemplar as example_only instead of a general rule", () => {
    expect(
      deriveRuleBehavioralPolicy({
        appliesTo: "general_response",
        exemplarCount: 1,
        kind: "do",
        rule: "For the omega example, return 17.",
      }),
    ).toEqual({
      behavioralKind: "exemplar_fact",
      enactmentSurface: "text_response",
      applicability: {
        appliesTo: "general_response",
        queryContains: ["the omega example"],
      },
      transferMode: "example_only",
    });
  });

  it("classifies exact response framing as a format contract", () => {
    expect(
      deriveRuleBehavioralPolicy({
        appliesTo: "general_response",
        exemplarCount: 1,
        kind: "do",
        rule:
          "Always start the response with \"Subject: [Internal]\" and end with \"Regards,\".",
      }),
    ).toEqual({
      behavioralKind: "format_contract",
      enactmentSurface: "text_response",
      applicability: {
        appliesTo: "general_response",
        exactFragments: {
          prefixes: ["Subject: [Internal]"],
          required: ["Subject: [Internal]", "Regards,"],
          suffixes: ["Regards,"],
        },
      },
      transferMode: "general",
    });
  });

  it("prefers host_action exactness and more specific transfer modes when selecting policies", () => {
    const hostPolicy = createFeedbackMemory({
      id: "host-policy",
      userId: "u-1",
      workspaceId: "ws-1",
      sessionId: "s-1",
      kind: "validated_pattern",
      rule: "If the prompt mentions detailed analysis, use QuickCheck first.",
      attributes: attachBehavioralPolicyAttributes(undefined, {
        behavioralKind: "first_action",
        enactmentSurface: "host_action",
        applicability: {
          appliesTo: "coding_agent",
          canonicalFirstAction: {
            kind: "tool_call",
            name: "QuickCheck",
            raw: "QuickCheck --network",
          },
          queryContains: ["detailed analysis"],
        },
        transferMode: "pattern_bounded",
      }),
      source,
      updatedAt: source.extractedAt,
    });
    const textPolicy = createFeedbackMemory({
      id: "text-policy",
      userId: "u-1",
      workspaceId: "ws-1",
      sessionId: "s-1",
      kind: "validated_pattern",
      rule: "If the prompt mentions detailed analysis, keep the answer concise.",
      attributes: attachBehavioralPolicyAttributes(undefined, {
        behavioralKind: "preference",
        enactmentSurface: "text_response",
        applicability: {
          appliesTo: "coding_agent",
          queryContains: ["detailed analysis"],
        },
        transferMode: "general",
      }),
      source,
      updatedAt: source.extractedAt,
    });
    const exemplarPolicy = createFeedbackMemory({
      id: "example-policy",
      userId: "u-1",
      workspaceId: "ws-1",
      sessionId: "s-1",
      kind: "validated_pattern",
      rule: "For the exact detailed analysis example, answer with 17.",
      attributes: attachBehavioralPolicyAttributes(undefined, {
        behavioralKind: "exemplar_fact",
        enactmentSurface: "text_response",
        applicability: {
          appliesTo: "general_response",
          queryContains: ["exact detailed analysis example"],
        },
        transferMode: "example_only",
      }),
      source,
      updatedAt: source.extractedAt,
    });

    const hostSelections = selectBehavioralPolicies({
      appliesTo: "coding_agent",
      feedback: [textPolicy, hostPolicy],
      query: "Need a detailed analysis of the network path.",
      surface: "host_action",
    });
    const textSelections = selectBehavioralPolicies({
      appliesTo: "general_response",
      feedback: [textPolicy, exemplarPolicy],
      query: "Use the exact detailed analysis example.",
      surface: "text_response",
    });

    expect(hostSelections[0]?.feedback.id).toBe("host-policy");
    expect(textSelections[0]?.feedback.id).toBe("example-policy");
  });

  it("ignores active source feedback that has not been compiled into a typed policy", () => {
    const feedback = createFeedbackMemory({
      id: "source-feedback",
      userId: "u-1",
      workspaceId: "ws-1",
      sessionId: "s-1",
      kind: "prefer",
      rule: "Prefer https URLs or warn instead of producing http URLs.",
      source,
      updatedAt: source.extractedAt,
    });

    const selections = selectBehavioralPolicies({
      appliesTo: "general_response",
      feedback: [feedback],
      query: "Provide the new client installer URL.",
      surface: "text_response",
    });

    expect(selections).toEqual([]);
    expect(buildBehavioralSteeringLines(selections)).toEqual([]);
  });

  it("builds explicit host-action steering only from persisted typed policies", () => {
    const feedback = createFeedbackMemory({
      id: "action-feedback",
      userId: "u-1",
      workspaceId: "ws-1",
      sessionId: "s-1",
      kind: "validated_pattern",
      rule: "copy_file takes destination first and source second.",
      attributes: attachBehavioralPolicyAttributes(undefined, {
        behavioralKind: "syntax_constraint",
        enactmentSurface: "host_action",
        applicability: {
          appliesTo: "general_response",
          argumentOrder: ["destination", "source"],
          canonicalFirstAction: {
            kind: "tool_call",
            name: "copy_file",
          },
          queryContains: ["copy_file"],
        },
        transferMode: "pattern_bounded",
      }),
      source,
      updatedAt: source.extractedAt,
    });

    const selections = selectBehavioralPolicies({
      appliesTo: "general_response",
      feedback: [feedback],
      query: "Copy /data/reports/report.txt into /var/backup/reports/report.txt with copy_file.",
      surface: "host_action",
    });

    expect(selections).toHaveLength(1);
    expect(buildBehavioralActionSteeringLines(selections)).toEqual(
      expect.arrayContaining([
        "Follow this first-action rule: copy_file takes destination first and source second.",
        "Use \"copy_file\" as the first executable action.",
        "Preserve argument order exactly: destination before source.",
      ]),
    );
  });

  it("treats canonical host actions as satisfied when stable args are preserved and extra instance args are added", () => {
    expect(
      behavioralPolicyActionSatisfiesCanonical(
        {
          args: ["--network", "/tmp/worktree-a"],
          kind: "tool_call",
          name: "QuickCheck",
          raw: "QuickCheck --network /tmp/worktree-a",
        },
        {
          args: ["--network"],
          kind: "tool_call",
          name: "QuickCheck",
          raw: "QuickCheck --network",
        },
      ),
    ).toBe(true);
  });
});
