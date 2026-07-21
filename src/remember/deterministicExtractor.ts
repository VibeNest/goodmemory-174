import type {
  MemoryCandidate,
  MemoryExtractionInput,
  MemoryExtractionResult,
  MemoryExtractor,
} from "./candidates";
import {
  createLanguageService,
  type LanguageConfig,
  type LanguageService,
} from "../language";

export function createDeterministicMemoryExtractor(
  config: LanguageConfig = {},
): MemoryExtractor {
  return createDeterministicMemoryExtractorWithLanguage(
    createLanguageService(config),
  );
}

export function createDeterministicMemoryExtractorWithLanguage(
  language: LanguageService,
): MemoryExtractor {

  return {
    async extract(input: MemoryExtractionInput): Promise<MemoryExtractionResult> {
      let counter = 0;
      const nextId = () => {
        counter += 1;
        return `candidate-${String(counter).padStart(4, "0")}`;
      };

      const candidates: MemoryCandidate[] = [];
      let ignoredMessageCount = 0;
      input.messages.forEach((message, index) => {
        if (message.role !== "user") {
          return;
        }

        const resolved = language.resolveFromText({
          locale: input.locale,
          text: message.content,
        });
        const clauses = language.splitClauses(message.content, resolved);
        const extracted = language.extractCandidates(
          {
            messages: [
              {
                ...message,
                sourceMessageIndex: index,
              },
            ],
            locale: resolved.locale,
            nextId,
          },
          resolved,
        );
        candidates.push(...extracted);
        const extractedForMessage = extracted.length > 0;
        if (clauses.length === 0 || !extractedForMessage) {
          ignoredMessageCount += 1;
        }
      });

      return {
        candidates,
        ignoredMessageCount,
      };
    },
  };
}
