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

  it("derives protocol rewrite and forbidden-fragment steering from explicit preference rules", () => {
    expect(
      deriveRuleBehavioralPolicy({
        appliesTo: "general_response",
        exemplarCount: 2,
        kind: "prefer",
        rule: "Prefer https URLs or warn instead of producing http URLs.",
      }),
    ).toEqual(
      expect.objectContaining({
        behavioralKind: "preference",
        enactmentSurface: "text_response",
        applicability: expect.objectContaining({
          appliesTo: "general_response",
          fallbackInstruction:
            "If the current probe explicitly requests http, warn first and then offer the https URL instead of silently substituting protocols.",
          forbiddenFragments: ["http://"],
          replacementPairs: [{ from: "http://", to: "https://" }],
        }),
        transferMode: "pattern_bounded",
      }),
    );
  });

  it("derives a URL surface template from exact protocol preference rules", () => {
    expect(
      deriveRuleBehavioralPolicy({
        appliesTo: "general_response",
        exemplarCount: 2,
        kind: "prefer",
        rule:
          "Prefer URLs in the form https://example.com/<page> or warn instead of producing http://example.com/<page> URLs. Keep the requested page after the host as a path segment, not as a subdomain.",
      }),
    ).toEqual(
      expect.objectContaining({
        behavioralKind: "preference",
        enactmentSurface: "text_response",
        applicability: expect.objectContaining({
          preferredFragments: ["https://example.com/"],
          queryContains: ["url"],
          urlTemplate: {
            example: "https://example.com/<page>",
            host: "example.com",
            pathPlacement: "path_after_host",
            scheme: "https",
          },
        }),
      }),
    );
  });

  it("derives guarded text-response steering from precondition rules", () => {
    expect(
      deriveRuleBehavioralPolicy({
        appliesTo: "general_response",
        exemplarCount: 2,
        kind: "do",
        rule:
          "Before using HeavyComputationAPI, check system load first and only proceed when load is Normal or Idle.",
      }),
    ).toEqual(
      expect.objectContaining({
        behavioralKind: "transformation_rule",
        enactmentSurface: "text_response",
        applicability: expect.objectContaining({
          appliesTo: "general_response",
          guard: {
            allowedStates: ["load Normal", "Idle"],
            check: "system load",
            fallbackInstruction:
              "If the required check cannot be verified, warn or defer instead of assuming it already passed.",
            subject: "HeavyComputationAPI",
          },
        }),
        transferMode: "pattern_bounded",
      }),
    );
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

  it("uses transient explicit feedback only when the caller opts into current-response enactment", () => {
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
      feedback: [],
      query: "Provide the new client installer URL.",
      surface: "text_response",
      transientFeedback: [feedback],
    });

    expect(selections).toHaveLength(1);
    expect(buildBehavioralSteeringLines(selections)).toEqual(
      expect.arrayContaining([
        'If the answer would contain "http://", rewrite it to "https://" instead of emitting the disallowed form.',
        'Do not emit the exact fragment "http://" in the final answer unless directly quoting user input.',
        "If the current probe explicitly requests http, warn first and then offer the https URL instead of silently substituting protocols.",
      ]),
    );
  });

  it("keeps transient single-example feedback bounded to matching probes", () => {
    const feedback = createFeedbackMemory({
      id: "single-example-feedback",
      userId: "u-1",
      workspaceId: "ws-1",
      sessionId: "s-1",
      kind: "do",
      rule: "For the omega example, return 17.",
      source,
      updatedAt: source.extractedAt,
    });

    const unrelatedSelections = selectBehavioralPolicies({
      appliesTo: "general_response",
      feedback: [],
      query: "Tell me the weather.",
      surface: "text_response",
      transientFeedback: [feedback],
    });

    const matchingSelections = selectBehavioralPolicies({
      appliesTo: "general_response",
      feedback: [],
      query: "Use the omega example.",
      surface: "text_response",
      transientFeedback: [feedback],
    });

    expect(unrelatedSelections).toEqual([]);
    expect(matchingSelections).toHaveLength(1);
    expect(matchingSelections[0]?.policy.transferMode).toBe("example_only");
  });

  it("adds URL origin and path-placement steering for exact URL template policies", () => {
    const feedback = createFeedbackMemory({
      id: "source-feedback-url-template",
      userId: "u-1",
      workspaceId: "ws-1",
      sessionId: "s-1",
      kind: "prefer",
      appliesTo: "general_response",
      lifecycle: "active",
      rule:
        "Prefer URLs in the form https://example.com/<page> or warn instead of producing http://example.com/<page> URLs. Keep the requested page after the host as a path segment, not as a subdomain.",
      source,
      updatedAt: source.extractedAt,
    });

    const selections = selectBehavioralPolicies({
      appliesTo: "general_response",
      feedback: [],
      query: "Can you generate a URL for the dashboard?",
      surface: "text_response",
      transientFeedback: [feedback],
    });

    expect(selections).toHaveLength(1);
    expect(buildBehavioralSteeringLines(selections)).toEqual(
      expect.arrayContaining([
        'Prefer a safe replacement fragment such as "https://example.com/" when the current probe matches.',
        'When answering with a URL, keep the established origin "https://example.com" and place the requested page after the host as a path segment, for example "https://example.com/<page>".',
        "Do not rewrite the requested page into a subdomain when the learned URL pattern uses a path after the host.",
        "If a short compliant answer, redirect, or warning already satisfies the request, stop there instead of expanding into a longer response.",
      ]),
    );
  });

  it("adds safe path-anchor steering for exact directory templates", () => {
    const feedback = createFeedbackMemory({
      id: "source-feedback-path-template",
      userId: "u-1",
      workspaceId: "ws-1",
      sessionId: "s-1",
      kind: "dont",
      appliesTo: "general_response",
      lifecycle: "active",
      rule:
        "Do not write under /system/audit; refuse or redirect to a safe path in the form /home/user/audit/<file>. Keep the requested filename under /home/user/audit/.",
      source,
      updatedAt: source.extractedAt,
    });

    const selections = selectBehavioralPolicies({
      appliesTo: "general_response",
      feedback: [],
      query: "Save the audit entry as /system/audit/new.json.",
      surface: "text_response",
      transientFeedback: [feedback],
    });

    expect(selections).toHaveLength(1);
    expect(buildBehavioralSteeringLines(selections)).toEqual(
      expect.arrayContaining([
        'Prefer a safe replacement fragment such as "/home/user/audit/" when the current probe matches.',
        'When redirecting a file path, keep the established safe directory anchor "/home/user/audit/" and preserve the requested filename under that directory, for example "/home/user/audit/<file>".',
        "Do not invent a new top-level directory when the learned safe path already provides a concrete user-writable location.",
      ]),
    );
  });

  it("adds safer-alternative and fallback steering for negative text-response rules", () => {
    const feedback = createFeedbackMemory({
      id: "source-feedback-2",
      userId: "u-1",
      workspaceId: "ws-1",
      sessionId: "s-1",
      kind: "dont",
      rule:
        "After repeated DeepAnalyzer timeouts on detailed analysis requests, avoid DeepAnalyzer and prefer QuickCheck or a warning.",
      source,
      updatedAt: source.extractedAt,
    });

    const selections = selectBehavioralPolicies({
      appliesTo: "general_response",
      feedback: [],
      query: "I need a detailed analysis of the network traffic.",
      surface: "text_response",
      transientFeedback: [feedback],
    });

    const lines = buildBehavioralSteeringLines(selections);
    expect(lines).toEqual(
      expect.arrayContaining([
        'Prefer "QuickCheck" as the safer replacement behavior when the trigger matches.',
        "Prefer QuickCheck or warn instead of implying the avoided behavior.",
        "If a short compliant answer, redirect, or warning already satisfies the request, stop there instead of expanding into a longer response.",
      ]),
    );
    expect(
      lines.some((line) => line.includes("After repeated failures")),
    ).toBeFalse();
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
