import type {
  GoodMemoryConfig,
  GoodMemoryExtractionProviderConfig,
  GoodMemoryRetrievalConfig,
  GoodMemoryRetrievalPresetId,
  GoodMemorySemanticCandidatesConfig,
} from "./contracts";

// Pure expansion of retrieval.preset "recommended" (mirrors the
// remember.preset style: a named string that selects config, resolved in one
// unit-testable module). The preset reproduces the retrieval+extraction side
// of the public-claims LoCoMo profile: semantic candidate union topK 16
// (maxAdditions left unset so the engine derives it from the resolved topK,
// matching the claims command line exactly), conversational write-time
// extraction when a model resolves, and an auto→hybrid routing bias. The
// answer-side abstention prompt in that profile is an application concern and
// is NOT covered here.

export const RECOMMENDED_SEMANTIC_CANDIDATES_TOP_K = 16;

// Brand carried by createLocalEmbeddingAdapter(): hashed-lexical vectors are
// not semantic, so the preset must reject them — structural typing makes a
// documentation-only ban unenforceable.
export const HASHED_LEXICAL_EMBEDDING_BRAND: unique symbol = Symbol.for(
  "goodmemory.embedding.hashed-lexical",
);

export interface GoodMemoryRetrievalPresetStatus {
  requested: GoodMemoryRetrievalPresetId;
  // Literal today: an inactive preset is unconstructible (no-embedding
  // configs throw). Kept as a field for a possible future degrade policy.
  active: true;
  // Whether the write-time half of the profile engaged: "conversational"
  // (flipped or explicitly set), "kept_existing" (explicit default mode or an
  // injected opaque extractor), or "unavailable" (no extractor resolves).
  extraction: "conversational" | "kept_existing" | "unavailable";
}

export interface ResolvedGoodMemoryRetrieval {
  autoStrategyBias?: "hybrid";
  bm25Ranking?: boolean;
  preset?: GoodMemoryRetrievalPresetStatus;
  semanticCandidates?: GoodMemorySemanticCandidatesConfig;
}

export interface ResolvedGoodMemoryRetrievalRuntime {
  extractionMode: "conversational" | "default";
  retrieval: ResolvedGoodMemoryRetrieval;
}

export function resolveGoodMemoryRetrievalRuntime(input: {
  adapters?: GoodMemoryConfig["adapters"];
  // Boolean(assistedExtractorModelConfig): a model resolved from provider
  // config OR env — the flip condition must not key on the config object
  // alone, because env-only extraction has no mode knob.
  assistedExtractorModelConfigured: boolean;
  embeddingEnabled: boolean;
  extraction?: GoodMemoryExtractionProviderConfig;
  retrieval?: GoodMemoryRetrievalConfig;
}): ResolvedGoodMemoryRetrievalRuntime {
  const explicitMode = input.extraction?.mode;
  const baselineExtractionMode: "conversational" | "default" =
    explicitMode === "conversational" ? "conversational" : "default";

  if (input.retrieval?.preset === undefined) {
    // Passthrough by reference: the non-preset path must stay byte-identical,
    // including the constructor's exact conversational predicate.
    return {
      extractionMode: baselineExtractionMode,
      retrieval: {
        bm25Ranking: input.retrieval?.bm25Ranking,
        semanticCandidates: input.retrieval?.semanticCandidates,
      },
    };
  }

  if (!input.embeddingEnabled) {
    throw new Error(
      [
        'retrieval.preset "recommended" requires a neural embedding endpoint, but none resolved. Configure one of:',
        "(1) env: GOODMEMORY_EMBEDDING_PROVIDER=openai, GOODMEMORY_EMBEDDING_MODEL=text-embedding-3-small, GOODMEMORY_EMBEDDING_API_KEY=<key>, plus GOODMEMORY_EMBEDDING_BASE_URL for any OpenAI-compatible endpoint;",
        "(2) providers.embedding in the createGoodMemory config;",
        "(3) adapters.embeddingAdapter.",
        "Zero-egress local option (Ollama): GOODMEMORY_EMBEDDING_BASE_URL=http://localhost:11434/v1, GOODMEMORY_EMBEDDING_MODEL=nomic-embed-text, GOODMEMORY_EMBEDDING_API_KEY=ollama (any placeholder value; see the README section \"Local embedding endpoint (Ollama)\").",
        "Remove retrieval.preset to keep the zero-dependency rules-only default.",
      ].join("\n"),
    );
  }

  const embeddingAdapter = input.adapters?.embeddingAdapter as
    | (Record<PropertyKey, unknown> & { embed: unknown })
    | undefined;
  if (embeddingAdapter?.[HASHED_LEXICAL_EMBEDDING_BRAND] === true) {
    throw new Error(
      'retrieval.preset "recommended" requires neural semantic embeddings; createLocalEmbeddingAdapter() produces hashed-lexical vectors, not semantic ones, and cannot reproduce the recommended profile. Configure a neural embedding endpoint (GOODMEMORY_EMBEDDING_* or providers.embedding — see the README Ollama recipe for a local zero-egress option), or remove retrieval.preset.',
    );
  }

  const userCandidates = input.retrieval.semanticCandidates;
  const semanticCandidates: GoodMemorySemanticCandidatesConfig = {
    ...userCandidates,
    topK: userCandidates?.topK ?? RECOMMENDED_SEMANTIC_CANDIDATES_TOP_K,
  };

  let extractionMode = baselineExtractionMode;
  let extractionStatus: GoodMemoryRetrievalPresetStatus["extraction"];
  if (explicitMode !== undefined) {
    extractionStatus =
      explicitMode === "conversational" ? "conversational" : "kept_existing";
  } else if (input.adapters?.assistedExtractor) {
    // Opaque injected extractor: mode only affects provider-built extractors.
    extractionStatus = "kept_existing";
  } else if (input.assistedExtractorModelConfigured) {
    extractionMode = "conversational";
    extractionStatus = "conversational";
  } else {
    extractionStatus = "unavailable";
  }

  return {
    extractionMode,
    retrieval: {
      autoStrategyBias: "hybrid",
      bm25Ranking: input.retrieval.bm25Ranking,
      preset: {
        active: true,
        extraction: extractionStatus,
        requested: "recommended",
      },
      semanticCandidates,
    },
  };
}
