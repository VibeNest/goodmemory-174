import type { EvidenceLedgerEntry } from "../recall/evidenceLedger";
import type { ClaimProjection } from "../recall/projections/contracts";

export type EvidenceLedgerFormat =
  | "prose"
  | "chronology"
  | "compact_json"
  | "json_locale_note";

interface RenderedClaim {
  modality: ClaimProjection["modality"];
  object: string;
  objectEntityId?: string;
  observedAt: string;
  polarity: ClaimProjection["polarity"];
  predicate: string;
  subject: string;
  validFrom?: string;
  validUntil?: string;
}

interface RenderedEvidenceLedgerEntry {
  actor?: string;
  claim?: RenderedClaim;
  evidenceId: string;
  excerpt: string;
  memoryId: string;
  relation: EvidenceLedgerEntry["relation"];
  status: EvidenceLedgerEntry["temporalStatus"];
}

function renderClaim(
  claim: NonNullable<EvidenceLedgerEntry["claim"]>,
): RenderedClaim {
  return {
    modality: claim.modality,
    object: claim.objectText,
    ...(claim.objectEntityId ? { objectEntityId: claim.objectEntityId } : {}),
    observedAt: claim.observedAt,
    polarity: claim.polarity,
    predicate: claim.predicateKey,
    subject: claim.subjectEntityId,
    ...(claim.validFrom ? { validFrom: claim.validFrom } : {}),
    ...(claim.validUntil ? { validUntil: claim.validUntil } : {}),
  };
}

function renderEntry(
  entry: EvidenceLedgerEntry,
): RenderedEvidenceLedgerEntry {
  return {
    evidenceId: entry.evidenceId,
    memoryId: entry.sourceMemoryId,
    status: entry.temporalStatus,
    relation: entry.relation,
    excerpt: entry.excerpt,
    ...(entry.actor ? { actor: entry.actor } : {}),
    ...(entry.claim ? { claim: renderClaim(entry.claim) } : {}),
  };
}

function renderProseEntry(entry: RenderedEvidenceLedgerEntry): string {
  return [
    `Evidence ${JSON.stringify(entry.evidenceId)} from memory ${JSON.stringify(entry.memoryId)}.`,
    `Temporal status: ${entry.status}.`,
    `Relation: ${entry.relation}.`,
    entry.actor ? `Actor: ${JSON.stringify(entry.actor)}.` : undefined,
    entry.claim ? `Claim: ${JSON.stringify(entry.claim)}.` : undefined,
    `Excerpt: ${JSON.stringify(entry.excerpt)}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

function chronologicalEntries(
  entries: readonly EvidenceLedgerEntry[],
): EvidenceLedgerEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const leftTime = left.entry.claim?.observedAt ?? "\uffff";
      const rightTime = right.entry.claim?.observedAt ?? "\uffff";
      return leftTime.localeCompare(rightTime) ||
        left.entry.evidenceId.localeCompare(right.entry.evidenceId) ||
        left.entry.sourceMemoryId.localeCompare(right.entry.sourceMemoryId) ||
        left.index - right.index;
    })
    .map(({ entry }) => entry);
}

export function renderEvidenceLedgerContext(
  entries: readonly EvidenceLedgerEntry[],
  format: EvidenceLedgerFormat,
  locale = "en",
): string {
  const ordered = format === "chronology"
    ? chronologicalEntries(entries)
    : entries;
  const rendered = ordered.map(renderEntry);

  if (format === "compact_json") {
    return JSON.stringify(rendered);
  }
  if (format === "json_locale_note") {
    return JSON.stringify({
      locale,
      note: locale.toLowerCase().startsWith("zh")
        ? "按时间状态和证据关系阅读以下条目。"
        : "Read entries using their temporal status and evidence relation.",
      evidence: rendered,
    });
  }
  return rendered.map(renderProseEntry).join("\n");
}
