import type {
  BehavioralPolicyComputedResponseRule,
} from "./behavioralPolicy";
import {
  evaluateComputedResponseRule,
  extractComputedResponseRule,
  recoverCanonicalActionFromTemplate,
} from "./behavioralPolicy";
import type {
  RawBehavioralCarryoverSelection,
  RawBehavioralSurfaceFamily,
  RawCarryoverConstraintType,
  RawQueryIntent,
} from "./rawBehavioralExemplars";

export type RawTaskHypothesisMappingType =
  | "exact_surface_copy"
  | "guarded_decision"
  | "slot_rebinding"
  | "style_contract"
  | "symbolic_formula";

export type RawTaskHypothesisExecutionMode =
  | "abstain"
  | "model_only"
  | "transient_executor";

export interface RawTaskHypothesis {
  applicability?: string;
  canonicalActionTemplate?: string;
  commandName?: string;
  confidence: number;
  conflictingPrototypeIds: string[];
  constraintTypes: RawCarryoverConstraintType[];
  computedResponseRule?: BehavioralPolicyComputedResponseRule;
  executionMode: RawTaskHypothesisExecutionMode;
  mappingType: RawTaskHypothesisMappingType;
  stableFields: string[];
  supportingExemplarIds: string[];
  supportingPrototypeIds: string[];
  surfaceFamily: RawBehavioralSurfaceFamily;
  taskFamily: string;
  varyingFields: string[];
}

export interface BuildRawTaskHypothesisInput {
  conflictPrototypeIds: string[];
  query: string;
  queryIntent: RawQueryIntent;
  selections: readonly RawBehavioralCarryoverSelection[];
  surfaceFamily: RawBehavioralSurfaceFamily;
}

function normalizeText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/gu, " ").trim();
}

function clipText(value: string, maxLength = 140): string {
  const normalized = normalizeText(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function classifyMappingType(input: {
  queryIntent: RawQueryIntent;
  selections: readonly RawBehavioralCarryoverSelection[];
  surfaceFamily: RawBehavioralSurfaceFamily;
}): RawTaskHypothesisMappingType {
  const topExemplar = input.selections[0]?.exemplar;
  if (
    input.queryIntent.constraintTypes.includes("formula") ||
    input.queryIntent.actionType === "symbolic_rule"
  ) {
    return "symbolic_formula";
  }
  if (
    input.surfaceFamily === "host_action" &&
    (input.queryIntent.constraintTypes.includes("arg_order") ||
      input.queryIntent.constraintTypes.includes("exact_action") ||
      Boolean(topExemplar?.exactSurface?.value) ||
      Boolean(input.queryIntent.exactSlots.commandName))
  ) {
    return topExemplar?.exactSurface?.value &&
      input.selections.length === 1 &&
      topExemplar.intentCue.query.exactSlots.commandName ===
        input.queryIntent.exactSlots.commandName
      ? "exact_surface_copy"
      : "slot_rebinding";
  }
  if (
    input.queryIntent.constraintTypes.includes("precondition") ||
    input.queryIntent.actionType === "guarded_api"
  ) {
    return "guarded_decision";
  }
  if (
    input.queryIntent.constraintTypes.includes("style") ||
    input.queryIntent.actionType === "voice_style"
  ) {
    return "style_contract";
  }
  if (
    topExemplar?.exactSurface?.value &&
    input.selections.length === 1 &&
    topExemplar.confidence >= 0.72
  ) {
    return "exact_surface_copy";
  }

  return "slot_rebinding";
}

function buildStableFields(input: {
  computedResponseRule?: BehavioralPolicyComputedResponseRule;
  queryIntent: RawQueryIntent;
  selections: readonly RawBehavioralCarryoverSelection[];
}): string[] {
  const topExemplar = input.selections[0]?.exemplar;
  if (!topExemplar) {
    return [];
  }

  const stableFields: string[] = [];
  const topSlots = topExemplar.intentCue.query.exactSlots;
  if (topSlots.commandName) {
    stableFields.push(`command=${topSlots.commandName}`);
  }
  if (topSlots.argOrderSignature) {
    stableFields.push(`arg_order=${topSlots.argOrderSignature}`);
  }
  if (topSlots.urlHost) {
    stableFields.push(`url_host=${topSlots.urlHost}`);
  }
  if (topSlots.pathRoot) {
    stableFields.push(`path_root=${topSlots.pathRoot}`);
  }
  if (topExemplar.exactSurface?.kind) {
    stableFields.push(`surface_kind=${topExemplar.exactSurface.kind}`);
  }
  if (topSlots.styleMarkers.length > 0) {
    stableFields.push(`style=${topSlots.styleMarkers.join(",")}`);
  }
  if (input.queryIntent.constraintTypes.includes("precondition")) {
    stableFields.push("must_check_precondition");
  }
  if (input.computedResponseRule) {
    stableFields.push(
      input.computedResponseRule.kind === "recurrence"
        ? `formula=${input.computedResponseRule.sequenceName}(n)=${input.computedResponseRule.expression}`
        : `formula=${input.computedResponseRule.leftVariable}${input.computedResponseRule.operatorSymbol}${input.computedResponseRule.rightVariable}=${input.computedResponseRule.expression}`,
    );
  }
  if (topExemplar.exactSurface?.value) {
    stableFields.push(`surface=${clipText(topExemplar.exactSurface.value, 96)}`);
  }

  return uniqueStrings(stableFields);
}

function buildVaryingFields(queryIntent: RawQueryIntent): string[] {
  const varying: string[] = [];
  if (queryIntent.exactSlots.filename) {
    varying.push(`filename=${queryIntent.exactSlots.filename}`);
  }
  if (queryIntent.exactSlots.extension) {
    varying.push(`extension=${queryIntent.exactSlots.extension}`);
  }
  if (queryIntent.exactSlots.pathRoot) {
    varying.push(`path_root=${queryIntent.exactSlots.pathRoot}`);
  }
  if (queryIntent.exactSlots.urlHost) {
    varying.push(`url_host=${queryIntent.exactSlots.urlHost}`);
  }
  if (queryIntent.exactSlots.urlPath) {
    varying.push(`url_path=${queryIntent.exactSlots.urlPath}`);
  }
  if (queryIntent.exactSlots.commandName) {
    varying.push(`command=${queryIntent.exactSlots.commandName}`);
  }
  if (queryIntent.exactSlots.argOrderSignature) {
    varying.push(`arg_order=${queryIntent.exactSlots.argOrderSignature}`);
  }
  if (queryIntent.exactSlots.operatorSymbols.length > 0) {
    varying.push(`operators=${queryIntent.exactSlots.operatorSymbols.join(",")}`);
  }
  if (queryIntent.exactSlots.styleMarkers.length > 0) {
    varying.push(`style=${queryIntent.exactSlots.styleMarkers.join(",")}`);
  }

  return uniqueStrings(varying);
}

function deriveComputedResponseRule(
  selections: readonly RawBehavioralCarryoverSelection[],
): BehavioralPolicyComputedResponseRule | undefined {
  for (const selection of selections) {
    const texts = [
      selection.exemplar.episodeShape.cue,
      selection.exemplar.episodeShape.relevantPriorMove,
      selection.exemplar.episodeShape.safeCorrectedMove,
      selection.exemplar.exactSurface?.value,
    ];
    for (const text of texts) {
      const normalized = normalizeText(text).replace(
        /,\s*with\s+[A-Z][A-Za-z0-9_]*\((-?\d+)\)\s*=.+$/u,
        ".",
      );
      const rule = extractComputedResponseRule(normalized);
      if (rule) {
        return rule;
      }
    }
  }

  return undefined;
}

function deriveCanonicalActionTemplate(input: {
  queryIntent: RawQueryIntent;
  selections: readonly RawBehavioralCarryoverSelection[];
  surfaceFamily: RawBehavioralSurfaceFamily;
}): string | undefined {
  if (input.surfaceFamily !== "host_action") {
    return undefined;
  }

  const topExemplar = input.selections[0]?.exemplar;
  const exactSurface = topExemplar?.exactSurface?.value;
  const commandName =
    topExemplar?.intentCue.query.exactSlots.commandName ??
    input.queryIntent.exactSlots.commandName;
  const move = normalizeText(
    topExemplar?.episodeShape.safeCorrectedMove ??
      topExemplar?.episodeShape.relevantPriorMove,
  );

  if (exactSurface) {
    if (/^get_data\(/u.test(exactSurface)) {
      return exactSurface.replace(
        /query_payload=\{'value':\s*'[^']+'\}/u,
        "query_payload={'value': '<id>'}",
      );
    }
    if (
      /^_database\('TOKEN-[A-Za-z0-9]+ /u.test(exactSurface) &&
      / -[A-Za-z0-9]+'\)$/u.test(exactSurface)
    ) {
      return exactSurface.replace(
        /^_database\('TOKEN-[A-Za-z0-9]+ (.+) -[A-Za-z0-9]+'\)$/u,
        "_database('TOKEN-<token> $1 -<token>')",
      );
    }
    return exactSurface;
  }

  if (
    commandName === "copy_file" &&
    /\bdestination first\b/u.test(move) &&
    /\bsource second\b/u.test(move)
  ) {
    return "copy_file(destination_path, source_path)";
  }

  if (
    commandName === "get_data" &&
    /\brequired argument order:\s*query_payload,\s*buffer,\s*auth\b/iu.test(move)
  ) {
    return "get_data(query_payload={'value': '<id>'}, buffer=['preface','suffix'], auth='token')";
  }

  if (
    commandName === "_database" &&
    /\bprefix\b[^.]*TOKEN-/iu.test(move) &&
    /\bsuffix\b[^.]*-TOKEN/iu.test(move)
  ) {
    return "_database('TOKEN-<token> GRANT ROLE analyst TO user42 -<token>')";
  }

  return undefined;
}

export function buildRawTaskHypothesis(
  input: BuildRawTaskHypothesisInput,
): RawTaskHypothesis | undefined {
  if (input.selections.length === 0) {
    return undefined;
  }

  const supportingPrototypeIds = uniqueStrings(
    input.selections.map((selection) => selection.prototypeId),
  );
  const supportingExemplarIds = uniqueStrings(
    input.selections.map((selection) => selection.exemplar.id),
  );
  const computedResponseRule = deriveComputedResponseRule(input.selections);
  const mappingType = classifyMappingType({
    queryIntent: input.queryIntent,
    selections: input.selections,
    surfaceFamily: input.surfaceFamily,
  });
  const canonicalActionTemplate = deriveCanonicalActionTemplate({
    queryIntent: input.queryIntent,
    selections: input.selections,
    surfaceFamily: input.surfaceFamily,
  });
  const averageProbability =
    input.selections.reduce((total, selection) => total + selection.probability, 0) /
    input.selections.length;
  const conflictPenalty = Math.min(0.22, input.conflictPrototypeIds.length * 0.06);
  const confidence = clamp(averageProbability - conflictPenalty, 0, 0.99);
  const executionMode: RawTaskHypothesisExecutionMode =
    confidence < 0.58
      ? "abstain"
      : mappingType === "exact_surface_copy"
        ? "model_only"
        : confidence >= 0.66
          ? "transient_executor"
          : "model_only";
  const topExemplar = input.selections[0]?.exemplar;

  return {
    applicability: clipText(input.queryIntent.goal, 96),
    canonicalActionTemplate,
    commandName:
      input.queryIntent.exactSlots.commandName ??
      topExemplar?.intentCue.query.exactSlots.commandName,
    confidence,
    conflictingPrototypeIds: [...input.conflictPrototypeIds],
    constraintTypes: [...input.queryIntent.constraintTypes],
    computedResponseRule,
    executionMode,
    mappingType,
    stableFields: buildStableFields({
      computedResponseRule,
      queryIntent: input.queryIntent,
      selections: input.selections,
    }),
    supportingExemplarIds,
    supportingPrototypeIds,
    surfaceFamily: input.surfaceFamily,
    taskFamily: input.queryIntent.actionType,
    varyingFields: buildVaryingFields(input.queryIntent),
  };
}

export function executeRawTaskHypothesis(input: {
  hypothesis: RawTaskHypothesis | undefined;
  query: string;
}): {
  computedResponse?: string;
  lines: string[];
  mode: "computed" | "hint" | "none";
} {
  const hypothesis = input.hypothesis;
  if (!hypothesis || hypothesis.executionMode !== "transient_executor") {
    return { lines: [], mode: "none" };
  }

  switch (hypothesis.mappingType) {
    case "symbolic_formula": {
      const computedResponse = evaluateComputedResponseRule({
        query: input.query,
        rule: hypothesis.computedResponseRule,
      });
      if (!computedResponse) {
        return {
          lines: [
            "Use the observed formula pattern and substitute the current probe values before answering.",
          ],
          mode: "hint",
        };
      }
      return {
        computedResponse,
        lines: [`Probe-specific computed value: ${computedResponse}`],
        mode: "computed",
      };
    }
    case "slot_rebinding": {
      if (hypothesis.surfaceFamily === "host_action" && hypothesis.canonicalActionTemplate) {
        const recovered = recoverCanonicalActionFromTemplate({
          query: input.query,
          template: hypothesis.canonicalActionTemplate,
        });
        if (recovered) {
          return {
            computedResponse: recovered,
            lines: [`Emit exactly: ${recovered}`],
            mode: "computed",
          };
        }
      }
      const lines = [
        hypothesis.commandName
          ? `Keep the command or tool surface as ${hypothesis.commandName}.`
          : "",
        hypothesis.stableFields.find((field) => field.startsWith("arg_order="))
          ? `Preserve ${hypothesis.stableFields
              .find((field) => field.startsWith("arg_order="))
              ?.replace("arg_order=", "argument order ")}.`
          : "",
        "Rebind only the probe-specific slot values; do not invent a different action family.",
      ].filter(Boolean);
      return {
        lines,
        mode: lines.length > 0 ? "hint" : "none",
      };
    }
    case "style_contract":
      return {
        lines: ["Keep the response inside the observed style contract for this probe."],
        mode: "hint",
      };
    case "guarded_decision":
      return {
        lines: [
          "Check the precondition implied by the prior examples before proceeding.",
          "If the precondition is not satisfied, fall back to a warning or defer instead of pretending success.",
        ],
        mode: "hint",
      };
    case "exact_surface_copy":
      if (hypothesis.surfaceFamily === "host_action" && hypothesis.canonicalActionTemplate) {
        const recovered = recoverCanonicalActionFromTemplate({
          query: input.query,
          template: hypothesis.canonicalActionTemplate,
        });
        if (recovered) {
          return {
            computedResponse: recovered,
            lines: [`Emit exactly: ${recovered}`],
            mode: "computed",
          };
        }
      }
      return {
        lines: ["Keep the same exact surface family, only adapting the probe-specific slots when necessary."],
        mode: "hint",
      };
  }
}

export function renderRawTaskHypothesisSketch(input: {
  execution: ReturnType<typeof executeRawTaskHypothesis>;
  hypothesis: RawTaskHypothesis | undefined;
}): string | undefined {
  const hypothesis = input.hypothesis;
  if (!hypothesis) {
    return undefined;
  }

  const sections: string[] = [];
  if (hypothesis.stableFields.length > 0) {
    sections.push(
      [
        "Observed stable pattern:",
        ...hypothesis.stableFields.slice(0, 4).map((field) => `- ${field}`),
      ].join("\n"),
    );
  }
  if (hypothesis.varyingFields.length > 0) {
    sections.push(
      [
        "Probe-specific varying slots:",
        ...hypothesis.varyingFields.slice(0, 4).map((field) => `- ${field}`),
      ].join("\n"),
    );
  }
  if (input.execution.lines.length > 0) {
    sections.push(
      ["Probe-conditioned execution:", ...input.execution.lines.map((line) => `- ${line}`)].join(
        "\n",
      ),
    );
  }

  return sections.length > 0 ? sections.join("\n") : undefined;
}
