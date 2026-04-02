import type {
  MemoryCandidate,
  MemoryExtractionInput,
  MemoryExtractionResult,
  MemoryExtractor,
} from "./candidates";

const GREETING_PATTERN = /^(hi|hello|hey|thanks|thank you|ok|okay)[.!]?$/i;
const PROFILE_NAME_PATTERN = /my name is\s+([a-z][a-z -]*)/i;
const EXPLICIT_FACT_PATTERN = /remember (?:that|this)\s+(.+)/i;
const PREFERENCE_PATTERN = /i prefer\s+(.+?)(?:\.|$)/i;
const REFERENCE_PATTERN =
  /use\s+([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)\s+as the source of truth/i;
const CORRECTED_REFERENCE_PATTERN =
  /(?:correction:\s*)?([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)\s+is now the source of truth,\s*not\s+([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)/i;
const DURABLE_INFERENCE_PATTERNS = [
  /\b(currently|still|blocked|failing|working on|responsible for)\b/i,
  /\bworkflow|migration|production|prod|project|roadmap|deadline|launch\b/i,
  /\bapi|runtime|build|schema|incident|bug|error\b/i,
];

function deriveFactCategory(
  content: string,
): "project" | "technical" | "personal" | "relationship" | "event" {
  const normalized = content.toLowerCase();

  if (
    normalized.includes("workflow") ||
    normalized.includes("project") ||
    normalized.includes("roadmap") ||
    normalized.includes("migration") ||
    normalized.includes("launch") ||
    normalized.includes("production") ||
    normalized.includes("prod")
  ) {
    return "project";
  }

  if (
    normalized.includes("api") ||
    normalized.includes("runtime") ||
    normalized.includes("bug") ||
    normalized.includes("error") ||
    normalized.includes("build") ||
    normalized.includes("schema")
  ) {
    return "technical";
  }

  if (
    normalized.includes("family") ||
    normalized.includes("partner") ||
    normalized.includes("friend")
  ) {
    return "relationship";
  }

  if (
    normalized.includes("travel") ||
    normalized.includes("event") ||
    normalized.includes("meeting")
  ) {
    return "event";
  }

  return "personal";
}

function deriveFeedbackKind(content: string): "do" | "dont" | "prefer" {
  const normalized = content.toLowerCase();

  if (normalized.includes("don't") || normalized.includes("do not")) {
    return "dont";
  }

  if (normalized.includes("prefer")) {
    return "prefer";
  }

  return "do";
}

function looksLikeDurableInferredFact(content: string): boolean {
  return DURABLE_INFERENCE_PATTERNS.some((pattern) => pattern.test(content));
}

function maybeExtractCandidate(
  content: string,
  index: number,
  nextId: () => string,
): MemoryCandidate | null {
  const trimmed = content.trim();

  if (trimmed.length === 0 || GREETING_PATTERN.test(trimmed)) {
    return null;
  }

  const nameMatch = trimmed.match(PROFILE_NAME_PATTERN);
  if (nameMatch) {
    return {
      id: nextId(),
      kindHint: "profile",
      explicitness: "explicit",
      content: nameMatch[1]!.trim(),
      sourceMessageIndex: index,
      sourceRole: "user",
      metadata: {
        profileField: "name",
      },
    };
  }

  const explicitFactMatch = trimmed.match(EXPLICIT_FACT_PATTERN);
  if (explicitFactMatch) {
    const factContent = explicitFactMatch[1]!.trim();

    return {
      id: nextId(),
      kindHint: "fact",
      explicitness: "explicit",
      content: factContent,
      sourceMessageIndex: index,
      sourceRole: "user",
      metadata: {
        category: deriveFactCategory(factContent),
      },
    };
  }

  const preferenceMatch = trimmed.match(PREFERENCE_PATTERN);
  if (preferenceMatch) {
    const preferenceValue = preferenceMatch[1]!.trim();

    return {
      id: nextId(),
      kindHint: "preference",
      explicitness: "explicit",
      content: preferenceValue,
      sourceMessageIndex: index,
      sourceRole: "user",
      metadata: {
        preferenceCategory: "response_style",
        preferenceValue,
      },
    };
  }

  const referenceMatch = trimmed.match(REFERENCE_PATTERN);
  if (referenceMatch) {
    const pointer = referenceMatch[1]!.trim();
    const title = pointer.split("/").at(-1) ?? pointer;

    return {
      id: nextId(),
      kindHint: "reference",
      explicitness: "explicit",
      content: pointer,
      sourceMessageIndex: index,
      sourceRole: "user",
      metadata: {
        referenceTitle: title,
        referencePointer: pointer,
      },
    };
  }

  const correctedReferenceMatch = trimmed.match(CORRECTED_REFERENCE_PATTERN);
  if (correctedReferenceMatch) {
    const pointer = correctedReferenceMatch[1]!.trim();
    const previousPointer = correctedReferenceMatch[2]!.trim();
    const title = pointer.split("/").at(-1) ?? pointer;

    return {
      id: nextId(),
      kindHint: "reference",
      explicitness: "explicit",
      content: pointer,
      sourceMessageIndex: index,
      sourceRole: "user",
      metadata: {
        referenceTitle: title,
        referencePointer: pointer,
        supersedesPointer: previousPointer,
      },
    };
  }

  if (
    /^(please|always|never|don't|do not|prefer)\b/i.test(trimmed) ||
    /\bplease\b/i.test(trimmed)
  ) {
    return {
      id: nextId(),
      kindHint: "feedback",
      explicitness: "explicit",
      content: trimmed,
      sourceMessageIndex: index,
      sourceRole: "user",
      metadata: {
        feedbackKind: deriveFeedbackKind(trimmed),
        appliesTo: "general_response",
      },
    };
  }

  if (trimmed.length >= 24 && looksLikeDurableInferredFact(trimmed)) {
    return {
      id: nextId(),
      kindHint: "fact",
      explicitness: "inferred",
      content: trimmed,
      sourceMessageIndex: index,
      sourceRole: "user",
      metadata: {
        category: deriveFactCategory(trimmed),
      },
    };
  }

  return null;
}

export function createDeterministicMemoryExtractor(): MemoryExtractor {
  return {
    async extract(input: MemoryExtractionInput): Promise<MemoryExtractionResult> {
      const candidates: MemoryCandidate[] = [];
      let ignoredMessageCount = 0;
      let counter = 0;
      const nextId = () => {
        counter += 1;
        return `candidate-${String(counter).padStart(4, "0")}`;
      };

      input.messages.forEach((message, index) => {
        if (message.role !== "user") {
          return;
        }

        const candidate = maybeExtractCandidate(message.content, index, nextId);

        if (!candidate) {
          ignoredMessageCount += 1;
          return;
        }

        candidates.push(candidate);
      });

      return {
        candidates,
        ignoredMessageCount,
      };
    },
  };
}
