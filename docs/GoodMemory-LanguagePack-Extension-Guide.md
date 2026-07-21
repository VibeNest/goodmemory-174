# GoodMemory LanguagePack Extension Guide

GoodMemory treats language support as a vertical semantic boundary. A language
is not complete when only its labels or stopwords exist: the same
`LanguagePack` must govern write-time extraction, recall planning, lexical
search, entity matching, temporal interpretation, and context rendering.

## Built-in packs

The root package includes:

| Pack id | Locale claims | Compatibility group |
|---|---|---|
| `en` | `en` | `en` |
| `zh-Hans` | `zh-Hans`, `zh-CN`, `zh-SG` | `zh` |
| `zh-Hant` | `zh-Hant`, `zh-TW`, `zh-HK`, `zh-MO` | `zh` |
| `ja` | `ja` | `ja` |

Explicit per-call locale wins over detection. With `detection: "auto"`, kana
selects Japanese and script-specific Chinese characters select the matching
Chinese pack. Text containing only Han characters is inherently ambiguous, so
GoodMemory resolves it with `defaultLocale` instead of guessing between
Simplified Chinese, Traditional Chinese, and Japanese.

```ts
import { createGoodMemory } from "goodmemory";

const memory = createGoodMemory({
  language: {
    defaultLocale: "zh-TW",
    detection: "auto",
  },
});

await memory.remember({
  locale: "ja-JP",
  scope: { userId: "u-1" },
  messages: [{ role: "user", content: "現在の役割はリリース責任者です。" }],
});

const recall = await memory.recall({
  locale: "ja-JP",
  scope: { userId: "u-1" },
  query: "現在の役割は何ですか？",
});
```

`remember()` and `recall()` metadata expose the resolved locale, resolution
source, pack id, and analyzer version. Durable provenance stores the same
identity so later projection repair can reproduce the original analysis.
For a mixed-language `remember()` batch, each candidate and its evidence use
the pack resolved from that candidate's source message; the operation metadata
still describes the batch as a whole. Session archives persist their resolved
locale instead of trying to infer it later from a rendered summary.

## The extension contract

Custom packs implement the exported `LanguagePack` interface. Its methods form
one contract and should be tested together:

- identity: `id`, `apiVersion`, `analyzerVersion`, `compatibilityGroup`, locale
  claims, and default locale
- routing: language detection and locale ownership
- lexical semantics: equality normalization, scoring tokens, bounded search
  terms, clause splitting, and sentence splitting
- recall semantics: query decomposition, structured query intents, temporal
  parsing and resolution, entity extraction, alias matching, and entity-candidate
  eligibility
- write semantics: structured content signals such as durable/correction cues
  and source-of-truth pointer transitions, plus candidate extraction
- presentation: localized render labels

Register a custom pack through `GoodMemoryConfig.language.packs`. To replace a
built-in pack, reuse its id and locale claims; a different id that claims an
already-owned locale is rejected at startup.
Pack identity and resolver configuration are canonicalized and snapshotted
when the service is created. Empty identity/default-locale fields are rejected,
and the service snapshots declared callbacks plus top-level enumerable pack
state. Pack callbacks run against that snapshot, so mutating the original
config or top-level pack fields later does not reconfigure the running service.
A pack is still a deterministic, versioned descriptor: its callbacks must not
depend on mutable external state, class-private state, or mutable nested
objects, which cannot be generically snapshotted. Close over immutable analyzer
data and construct a new service with a bumped `analyzerVersion` whenever those
semantics change.

```ts
import {
  createEnglishLanguagePack,
  createGoodMemory,
  type LanguagePack,
} from "goodmemory";

const base = createEnglishLanguagePack();
const productEnglish: LanguagePack = {
  ...base,
  analyzerVersion: "2-product-terms",
  buildSearchTerms(text) {
    return [...new Set([...base.buildSearchTerms(text), ...productTerms(text)])];
  },
};

const memory = createGoodMemory({
  language: {
    defaultLocale: "en-US",
    packs: [productEnglish],
  },
});

function productTerms(text: string): string[] {
  return text.includes("GM") ? ["goodmemory"] : [];
}
```

Keep search-term expansion deterministic and bounded. It is a candidate
generation aid, not a place for remote model calls or unbounded synonym graphs.
Terms are whitespace-delimited canonical tokens and are compared with a
locale-neutral Unicode case fold across storage backends. A pack must emit its
own locale-correct canonical form and must not encode a semantic distinction
only through letter case; storage does not perform language-specific stemming
or CJK segmentation.

If `language.detector` is configured in `auto` mode, also provide a stable
`detectorVersion`. Without it, `getAnalyzerManifest().persistable` is `false`
and a persistent projection proof must fail closed. A detector is ignored in
`default_only` mode, so it does not affect that mode's manifest eligibility.

## Chinese script interoperability

The two Chinese packs share compatibility group `zh`. They canonicalize text
with the pinned `opencc-js` analyzer and index the original terms plus one
canonical Simplified form. This bounded bridge lets a Traditional query
retrieve a Simplified source (and the reverse) while keeping the exact
user-authored text as canonical memory and display content.

Do not persist converted text over the source record. Conversion belongs only
to equality keys and derived `searchText`.

## Projection and storage rules

Language-aware projection documents carry:

- raw `text`
- derived `searchText`
- `searchLocale`
- `languagePackId`
- `searchAnalyzerVersion`
- `searchSchemaVersion`

SQLite FTS and PostgreSQL GIN use `searchText` only for candidate admission.
Application-level scoring remains the final cross-backend ranking authority, so
storage-specific tokenizers cannot redefine recall semantics.

Changing normalization, tokenization, search-term generation, entity
canonicalization, detection, or sentence boundaries requires an
`analyzerVersion` bump.
Existing derived projections must then be rebuilt; canonical memory records and
their raw text remain unchanged. Treat missing or mismatched projection proof
as stale and rebuild fail-closed.

`LanguageService.getAnalyzerManifest()` returns a stable, sorted manifest of
the resolver configuration and every active pack, including the neutral
fallback. Its `resolutionOrder` separately preserves the effective pack lookup
order, while the sorted `packs` array keeps serialization deterministic. A
projection build may use the manifest only when `persistable` is `true`.
Projection build identity should hash that manifest together with the
projection/search schema and canonical source-generation proof; it must not
infer analyzer identity from one locale or one indexed document.

## Migration from the former language adapter

There is no compatibility adapter or per-module language switch. Migrate by:

1. moving every language-specific rule into a complete `LanguagePack`;
2. registering it through `language.packs` or replacing a built-in id;
3. passing explicit locale when the host knows it, especially for Han-only
   text;
4. bumping `analyzerVersion` for semantic analyzer changes;
5. versioning any custom locale detector used by auto-detection;
6. rebuilding derived recall projections after analyzer or search-schema
   changes; and
7. verifying provenance, cross-script retrieval, temporal planning, entity
   matching, and localized context output.

The optional `language.detector` remains a routing override only. It returns a
locale; it does not replace the pack's semantic responsibilities.

## Acceptance checklist

A new pack is ready only when tests cover:

- explicit locale, auto-detection, default fallback, and ambiguous text;
- equality normalization and bounded search terms;
- write extraction and durable language provenance;
- query intent, decomposition, temporal expressions, and entity aliases;
- durable/correction cues and source-of-truth pointer transitions;
- a sentinel custom language whose non-English query and content signals drive
  the same selection and remember paths without business-module changes;
- document, entity, and claim retrieval channels;
- SQLite and PostgreSQL `searchText` behavior where applicable;
- context/evidence rendering and CJK token budgeting where applicable; and
- a real `remember -> recall -> buildContext` integration path.
