import { describe, expect, it } from "bun:test";
import { createFeedbackMemory } from "../../src/domain/records";
import { createMemorySource } from "../../src/domain/provenance";
import {
  applyTextResponseEnactmentPlan,
  behavioralPolicyActionSatisfiesCanonical,
  attachBehavioralPolicyAttributes,
  buildBehavioralActionSteeringLines,
  buildBehavioralSteeringLines,
  buildStructuredTextResponseControlLines,
  deriveRuleBehavioralPolicy,
  isSteeringOnlyBehavioralPolicy,
  recoverStructuredFirstActionAnswer,
  readBehavioralPolicyFromFeedbackMemory,
  resolveTextResponseEnactmentPlan,
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

  it("keeps simple procedural guidance visible while hiding structured controls", () => {
    const simplePolicy = deriveRuleBehavioralPolicy({
      appliesTo: "coding_agent",
      exemplarCount: 2,
      kind: "do",
      rule: "Use bullet points.",
    });
    const hardPolicy = deriveRuleBehavioralPolicy({
      appliesTo: "general_response",
      exemplarCount: 2,
      kind: "dont",
      rule: "Explain this concept with a simple analogy and avoid the term API.",
    });

    expect(simplePolicy).toBeDefined();
    expect(hardPolicy).toBeDefined();

    const simpleFeedback = createFeedbackMemory({
      id: "simple-policy",
      userId: "u-1",
      workspaceId: "ws-1",
      sessionId: "s-1",
      kind: "validated_pattern",
      rule: "Use bullet points.",
      attributes: attachBehavioralPolicyAttributes(undefined, simplePolicy!),
      source,
      updatedAt: source.extractedAt,
    });
    const hardFeedback = createFeedbackMemory({
      id: "hard-policy",
      userId: "u-1",
      workspaceId: "ws-1",
      sessionId: "s-1",
      kind: "validated_pattern",
      rule: "Explain this concept with a simple analogy and avoid the term API.",
      attributes: attachBehavioralPolicyAttributes(undefined, hardPolicy!),
      source,
      updatedAt: source.extractedAt,
    });

    expect(isSteeringOnlyBehavioralPolicy(simpleFeedback)).toBe(false);
    expect(isSteeringOnlyBehavioralPolicy(hardFeedback)).toBe(true);
  });

  it("classifies a single exemplar as example_only instead of a general rule", () => {
    expect(
      deriveRuleBehavioralPolicy({
        appliesTo: "general_response",
        exemplarCount: 1,
        kind: "do",
        rule: "For the omega example, return 17.",
      }),
    ).toEqual(
      expect.objectContaining({
        behavioralKind: "exemplar_fact",
        enactmentSurface: "text_response",
        applicability: expect.objectContaining({
          appliesTo: "general_response",
          queryContains: ["the omega example"],
        }),
        transferMode: "example_only",
      }),
    );
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
    ).toEqual(
      expect.objectContaining({
        behavioralKind: "format_contract",
        enactmentSurface: "text_response",
        applicability: expect.objectContaining({
          appliesTo: "general_response",
          exactFragments: {
            prefixes: ["Subject: [Internal]"],
            required: ["Subject: [Internal]", "Regards,"],
            suffixes: ["Regards,"],
          },
        }),
        transferMode: "general",
      }),
    );
  });

  it("derives subject-line and sign-off requirements for policy-announcement format rules", () => {
    expect(
      deriveRuleBehavioralPolicy({
        appliesTo: "general_response",
        exemplarCount: 2,
        kind: "do",
        rule:
          "At TechNova policy announcements, include a Subject line, start with 'Dear Team,' and sign off as 'Sincerely, TechNova Management.'",
      }),
    ).toEqual(
      expect.objectContaining({
        behavioralKind: "format_contract",
        applicability: expect.objectContaining({
          exactFragments: expect.objectContaining({
            prefixes: ["Dear Team,"],
            required: expect.arrayContaining([
              "Subject:",
              "Dear Team,",
              "Sincerely, TechNova Management.",
            ]),
            suffixes: ["Sincerely, TechNova Management."],
          }),
        }),
      }),
    );
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
          textResponsePlan: expect.objectContaining({
            concise: true,
          }),
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
        behavioralKind: "guarded_policy",
        enactmentSurface: "text_response",
        applicability: expect.objectContaining({
          appliesTo: "general_response",
          guardedBehavior: {
            allowedWhen: ["load Normal", "Idle"],
            fallbackBehavior: {
              warningMessage:
                "Check system load first and only proceed when load Normal or Idle; otherwise warn or defer instead of assuming it already passed.",
            },
            precondition: "system load",
            subject: "HeavyComputationAPI",
          },
          guard: {
            allowedStates: ["load Normal", "Idle"],
            check: "system load",
            fallbackInstruction:
              "Check system load first and only proceed when load Normal or Idle; otherwise warn or defer instead of assuming it already passed.",
            subject: "HeavyComputationAPI",
          },
        }),
        transferMode: "pattern_bounded",
      }),
    );
  });

  it("derives forbidden-term and analogy preferences from jargon-avoidance rules", () => {
    expect(
      deriveRuleBehavioralPolicy({
        appliesTo: "general_response",
        exemplarCount: 2,
        kind: "dont",
        rule: "Explain this concept with a simple analogy and avoid the term API.",
      }),
    ).toEqual(
      expect.objectContaining({
        behavioralKind: "avoidance",
        applicability: expect.objectContaining({
          forbiddenFragments: ["API"],
          preferredFragments: ["like"],
          textResponsePlan: expect.objectContaining({
            operations: expect.arrayContaining([
              expect.objectContaining({
                kind: "rewrite_output_slot",
                preferredFragments: ["like"],
              }),
              expect.objectContaining({
                forbiddenFragments: ["API"],
                kind: "block_surface",
              }),
            ]),
          }),
        }),
      }),
    );
  });

  it("enforces filetype replacement and case-insensitive lexical blocking on final text", () => {
    const filetypePlan = resolveTextResponseEnactmentPlan(
      selectBehavioralPolicies({
        appliesTo: "general_response",
        feedback: [],
        query: "Save the export as Report.EXE.",
        surface: "text_response",
        transientFeedback: [
          createFeedbackMemory({
            id: "filetype-feedback",
            userId: "u-1",
            workspaceId: "ws-1",
            sessionId: "s-1",
            kind: "dont",
            rule: "Do not produce .exe artifacts; use .txt instead.",
            source,
            updatedAt: source.extractedAt,
          }),
        ],
      }),
    );
    const lexicalPlan = resolveTextResponseEnactmentPlan(
      selectBehavioralPolicies({
        appliesTo: "general_response",
        feedback: [],
        query: "Explain the integration simply.",
        surface: "text_response",
        transientFeedback: [
          createFeedbackMemory({
            id: "lexical-feedback",
            userId: "u-1",
            workspaceId: "ws-1",
            sessionId: "s-1",
            kind: "dont",
            rule: "Explain this concept with a simple analogy and avoid the term API.",
            source,
            updatedAt: source.extractedAt,
          }),
        ],
      }),
    );

    const rewrittenFile = applyTextResponseEnactmentPlan({
      answer: "Save it as Report.EXE.",
      plan: filetypePlan,
      query: "Save the export as Report.EXE.",
    });
    const rewrittenLexical = applyTextResponseEnactmentPlan({
      answer: "An api connects your service to another system.",
      plan: lexicalPlan,
      query: "Explain the integration simply.",
    });

    expect(rewrittenFile).toContain("Report.txt");
    expect(rewrittenFile.toLowerCase()).not.toContain(".exe");
    expect(rewrittenLexical.toLowerCase()).not.toContain("api");
    expect(rewrittenLexical.toLowerCase()).toContain("like");
  });

  it("enforces filename-level filetype replacement from prefer-or-warn rules", () => {
    const plan = resolveTextResponseEnactmentPlan(
      selectBehavioralPolicies({
        appliesTo: "general_response",
        feedback: [],
        query: "Import report.dat with DataImporter.",
        surface: "text_response",
        transientFeedback: [
          createFeedbackMemory({
            id: "filename-filetype-feedback",
            userId: "u-1",
            workspaceId: "ws-1",
            sessionId: "s-1",
            kind: "dont",
            rule:
              "When DataImporter previously failed on .dat files, prefer report.json or warn about report.dat.",
            source,
            updatedAt: source.extractedAt,
          }),
        ],
      }),
    );

    const rewritten = applyTextResponseEnactmentPlan({
      answer: "Use report.dat for the import.",
      plan,
      query: "Import report.dat with DataImporter.",
    });

    expect(rewritten).toContain("report.json");
    expect(rewritten).not.toContain("report.dat");
  });

  it("routes distrust policies to a specialist replacement instead of the distrusted default", () => {
    const selections = selectBehavioralPolicies({
      appliesTo: "general_response",
      feedback: [],
      query: "The request distrusts AutoAnalyzer; analyze the incident.",
      surface: "text_response",
      transientFeedback: [
        createFeedbackMemory({
          id: "distrust-feedback",
          userId: "u-1",
          workspaceId: "ws-1",
          sessionId: "s-1",
          kind: "dont",
          rule:
            "When the request distrusts AutoAnalyzer, use SecurityReview specialist or warn and refuse the default path.",
          source,
          updatedAt: source.extractedAt,
        }),
      ],
    });
    const plan = resolveTextResponseEnactmentPlan(selections);

    expect(buildBehavioralSteeringLines(selections)).toEqual(
      expect.arrayContaining([
        'Prefer "SecurityReview specialist" as the safer replacement behavior when the trigger matches.',
      ]),
    );
    const routed = applyTextResponseEnactmentPlan({
      answer: "Use AutoAnalyzer now.",
      plan,
      query: "The request distrusts AutoAnalyzer; analyze the incident.",
    });

    expect(routed).toContain("SecurityReview specialist");
    expect(routed.toLowerCase()).toContain("warn");
    expect(routed).not.toContain("AutoAnalyzer");
  });

  it("keeps distrust routing hard even when the source signal is classified as a positive rule", () => {
    const selections = selectBehavioralPolicies({
      appliesTo: "general_response",
      feedback: [],
      query: "The request distrusts AutoAnalyzer; analyze the incident.",
      surface: "text_response",
      transientFeedback: [
        createFeedbackMemory({
          id: "positive-distrust-feedback",
          userId: "u-1",
          workspaceId: "ws-1",
          sessionId: "s-1",
          kind: "do",
          rule:
            "When the request distrusts AutoAnalyzer, use SecurityReview specialist or warn and refuse the default path.",
          source,
          updatedAt: source.extractedAt,
        }),
      ],
    });
    const plan = resolveTextResponseEnactmentPlan(selections);

    expect(buildStructuredTextResponseControlLines(plan)).toEqual(
      expect.arrayContaining([
        "require_warning: Warn and route to SecurityReview specialist instead of using the distrusted default path.",
        "warning_alternatives: SecurityReview specialist",
      ]),
    );
    expect(
      applyTextResponseEnactmentPlan({
        answer: "Given the distrust of AutoAnalyzer, use a SecurityReview-style review.",
        plan,
        query: "The request distrusts AutoAnalyzer; analyze the incident.",
      }),
    ).toBe(
      "Warn and route to SecurityReview specialist instead of using the distrusted default path. Use SecurityReview specialist instead.",
    );
  });

  it("derives safer alternatives from side-effect avoidance rules", () => {
    expect(
      deriveRuleBehavioralPolicy({
        appliesTo: "general_response",
        exemplarCount: 2,
        kind: "dont",
        rule:
          "Avoid CacheCleaner side effects; warn or choose SafeCleaner/exclude sessions instead.",
      }),
    ).toEqual(
      expect.objectContaining({
        behavioralKind: "avoidance",
        applicability: expect.objectContaining({
          preferredAlternatives: ["SafeCleaner", "exclude sessions"],
          textResponsePlan: expect.objectContaining({
            operations: expect.arrayContaining([
              expect.objectContaining({
                kind: "require_warning",
                preferredAlternatives: ["SafeCleaner", "exclude sessions"],
              }),
            ]),
          }),
        }),
      }),
    );
  });

  it("requires backup wording even when a side-effect answer already names a safe replacement", () => {
    const plan = resolveTextResponseEnactmentPlan(
      selectBehavioralPolicies({
        appliesTo: "general_response",
        feedback: [],
        query: "Clean the cache but preserve user sessions.",
        surface: "text_response",
        transientFeedback: [
          createFeedbackMemory({
            id: "backup-feedback",
            userId: "u-1",
            workspaceId: "ws-1",
            sessionId: "s-1",
            kind: "dont",
            rule:
              "Avoid CacheCleaner side effects; warn, require a backup, and choose SafeCleaner/exclude sessions instead.",
            source,
            updatedAt: source.extractedAt,
          }),
        ],
      }),
    );

    const routed = applyTextResponseEnactmentPlan({
      answer: "Use SafeCleaner instead.",
      plan,
      query: "Clean the cache but preserve user sessions.",
    });

    expect(routed).toContain("SafeCleaner");
    expect(routed.toLowerCase()).toContain("backup");
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

  it("allows structured current-response controls even when the probe lacks lexical trigger overlap", () => {
    const feedback = createFeedbackMemory({
      id: "etiquette-feedback",
      userId: "u-1",
      workspaceId: "ws-1",
      sessionId: "s-1",
      kind: "do",
      rule:
        "At TechNova policy announcements, include a Subject line, start with 'Dear Team,' and sign off as 'Sincerely, TechNova Management.'",
      source,
      updatedAt: source.extractedAt,
    });

    const selections = selectBehavioralPolicies({
      appliesTo: "general_response",
      feedback: [],
      query: "Draft a short TechNova policy announcement that remote badge checks now begin on Monday.",
      surface: "text_response",
      transientFeedback: [feedback],
    });

    expect(selections).toHaveLength(1);
    expect(resolveTextResponseEnactmentPlan(selections)).toEqual(
      expect.objectContaining({
        operations: expect.arrayContaining([
          expect.objectContaining({
            kind: "rewrite_output_slot",
          }),
        ]),
      }),
    );
  });

  it("resolves a structured text-response enactment plan from compiled protocol policy", () => {
    const feedback = createFeedbackMemory({
      id: "protocol-plan-feedback",
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
    const plan = resolveTextResponseEnactmentPlan(selections);

    expect(plan).toEqual(
      expect.objectContaining({
        concise: true,
        operations: expect.arrayContaining([
          expect.objectContaining({
            kind: "rewrite_output_slot",
            replacementPairs: [{ from: "http://", to: "https://" }],
          }),
          expect.objectContaining({
            forbiddenFragments: ["http://"],
            kind: "block_surface",
          }),
          expect.objectContaining({
            kind: "require_warning",
          }),
        ]),
      }),
    );
    expect(buildStructuredTextResponseControlLines(plan)).toEqual(
      expect.arrayContaining([
        "rewrite_output_slot replacements: http:// -> https://",
        "block_surface forbidden: http://",
      ]),
    );
  });

  it("applies deterministic URL and path rewrites without leaking memory phrasing", () => {
    const protocolPlan = resolveTextResponseEnactmentPlan(
      selectBehavioralPolicies({
        appliesTo: "general_response",
        feedback: [],
        query: "Provide the dashboard URL.",
        surface: "text_response",
        transientFeedback: [
          createFeedbackMemory({
            id: "protocol-url-template",
            userId: "u-1",
            workspaceId: "ws-1",
            sessionId: "s-1",
            kind: "prefer",
            rule:
              "Prefer URLs in the form https://example.com/<page> or warn instead of producing http://example.com/<page> URLs. Keep the requested page after the host as a path segment, not as a subdomain.",
            source,
            updatedAt: source.extractedAt,
          }),
        ],
      }),
    );
    const pathPlan = resolveTextResponseEnactmentPlan(
      selectBehavioralPolicies({
        appliesTo: "general_response",
        feedback: [],
        query: "Save the audit entry as /system/audit/new.json.",
        surface: "text_response",
        transientFeedback: [
          createFeedbackMemory({
            id: "path-template",
            userId: "u-1",
            workspaceId: "ws-1",
            sessionId: "s-1",
            kind: "dont",
            rule:
              "Do not write under /system/audit; refuse or redirect to a safe path in the form /home/user/audit/<file>. Keep the requested filename under /home/user/audit/.",
            source,
            updatedAt: source.extractedAt,
          }),
        ],
      }),
    );

    expect(
      applyTextResponseEnactmentPlan({
        answer: "I remember the earlier rule, so use https://dashboard.example.com",
        plan: protocolPlan,
        query: "Provide the dashboard URL.",
      }),
    ).toBe("so use https://example.com/dashboard");
    expect(
      applyTextResponseEnactmentPlan({
        answer: "Write to /system/audit/old.json.",
        plan: pathPlan,
        query: "Save the audit entry as /system/audit/new.json.",
      }),
    ).toContain("/home/user/audit/new.json");
  });

  it("enforces warning and precondition fallbacks even when the draft answer is a vague refusal", () => {
    const protocolPlan = resolveTextResponseEnactmentPlan(
      selectBehavioralPolicies({
        appliesTo: "general_response",
        feedback: [],
        query: "Give me the download URL for the new client installer.",
        surface: "text_response",
        transientFeedback: [
          createFeedbackMemory({
            id: "protocol-warning",
            userId: "u-1",
            workspaceId: "ws-1",
            sessionId: "s-1",
            kind: "prefer",
            rule: "Prefer https URLs or warn instead of producing http URLs.",
            source,
            updatedAt: source.extractedAt,
          }),
        ],
      }),
    );
    const guardedPlan = resolveTextResponseEnactmentPlan(
      selectBehavioralPolicies({
        appliesTo: "general_response",
        feedback: [],
        query: "Use HeavyComputationAPI for this request.",
        surface: "text_response",
        transientFeedback: [
          createFeedbackMemory({
            id: "guarded-warning",
            userId: "u-1",
            workspaceId: "ws-1",
            sessionId: "s-1",
            kind: "do",
            rule:
              "Before using HeavyComputationAPI, check system load first and only proceed when load is Normal or Idle.",
            source,
            updatedAt: source.extractedAt,
          }),
        ],
      }),
    );

    expect(
      applyTextResponseEnactmentPlan({
        answer: "I don't have enough context to identify the installer URL.",
        plan: protocolPlan,
        query: "Give me the download URL for the new client installer.",
      }),
    ).toContain("https");
    expect(
      applyTextResponseEnactmentPlan({
        answer: "I can't use HeavyComputationAPI in this environment.",
        plan: guardedPlan,
        query: "Use HeavyComputationAPI for this request.",
      }),
    ).toContain("Check system load first.");
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
    expect(
      buildBehavioralActionSteeringLines(
        selections,
        "Without explanation, copy '/data/reports/report.txt' into '/var/backup/reports/' using the environment's canonical utility.",
      ),
    ).toEqual(
      expect.arrayContaining([
        "Follow this first-action rule: copy_file takes destination first and source second.",
        "The first line must be exactly: copy_file('/var/backup/reports/report.txt', '/data/reports/report.txt')",
        "Preserve argument order exactly: destination before source.",
      ]),
    );
    expect(
      recoverStructuredFirstActionAnswer({
        answer: "cp /data/reports/report.txt /var/backup/reports/",
        policies: selections,
        query:
          "Without explanation, copy '/data/reports/report.txt' into '/var/backup/reports/' using the environment's canonical utility.",
      }),
    ).toBe("copy_file('/var/backup/reports/report.txt', '/data/reports/report.txt')");
  });

  it("allows transient explicit feedback to recover structured host actions for the current turn", () => {
    const feedback = createFeedbackMemory({
      id: "transient-action-feedback",
      userId: "u-1",
      workspaceId: "ws-1",
      sessionId: "s-1",
      kind: "do",
      rule: "copy_file takes destination first and source second.",
      source,
      updatedAt: source.extractedAt,
    });

    const query =
      "Without explanation, copy '/data/reports/report.txt' into '/var/backup/reports/' using the environment's canonical utility.";
    const selections = selectBehavioralPolicies({
      appliesTo: "general_response",
      feedback: [],
      query,
      surface: "host_action",
      transientFeedback: [feedback],
    });

    expect(selections).toHaveLength(1);
    expect(
      buildBehavioralActionSteeringLines(selections, query),
    ).toEqual(
      expect.arrayContaining([
        "Follow this first-action rule: copy_file takes destination first and source second.",
        "The first line must be exactly: copy_file('/var/backup/reports/report.txt', '/data/reports/report.txt')",
        "Preserve argument order exactly: destination before source.",
      ]),
    );
    expect(
      recoverStructuredFirstActionAnswer({
        answer: "copy_file '/var/backup/reports/' '/data/reports/report.txt'",
        policies: selections,
        query,
      }),
    ).toBe("copy_file('/var/backup/reports/report.txt', '/data/reports/report.txt')");
  });

  it("recovers exact command syntax from explicit procedural command contracts", () => {
    const query =
      "For LogiDB compliance, list users older than 30 using the canonical query language.";
    const selections = selectBehavioralPolicies({
      appliesTo: "general_response",
      feedback: [],
      query,
      surface: "host_action",
      transientFeedback: [
        createFeedbackMemory({
          id: "exact-command-feedback",
          userId: "u-1",
          workspaceId: "ws-1",
          sessionId: "s-1",
          kind: "do",
          rule:
            "For LogiDB compliance requests that ask for users older than 30, output the exact LogiQL command FETCH users | FILTER age > 30.",
          source,
          updatedAt: source.extractedAt,
        }),
      ],
    });

    expect(
      buildBehavioralActionSteeringLines(selections, query),
    ).toEqual(
      expect.arrayContaining([
        "The first line must be exactly: FETCH users | FILTER age > 30",
      ]),
    );
    expect(
      recoverStructuredFirstActionAnswer({
        answer: "SELECT * FROM users WHERE age > 30",
        policies: selections,
        query,
      }),
    ).toBe("FETCH users | FILTER age > 30");
  });

  it("preserves dotted file paths in exact procedural command contracts", () => {
    const query = "Copy the report with the canonical file utility.";
    const selections = selectBehavioralPolicies({
      appliesTo: "general_response",
      feedback: [],
      query,
      surface: "host_action",
      transientFeedback: [
        createFeedbackMemory({
          id: "exact-dotted-command-feedback",
          userId: "u-1",
          workspaceId: "ws-1",
          sessionId: "s-1",
          kind: "do",
          rule:
            "For file-copy requests, output the exact command copy_file('/var/backup/reports/report.txt', '/data/reports/report.txt').",
          source,
          updatedAt: source.extractedAt,
        }),
      ],
    });

    expect(
      buildBehavioralActionSteeringLines(selections, query),
    ).toEqual(
      expect.arrayContaining([
        "The first line must be exactly: copy_file('/var/backup/reports/report.txt', '/data/reports/report.txt')",
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
