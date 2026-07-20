import { renderEvidenceLedgerContext } from "../answer/evidenceLedgerContext";
import type { EvidenceLedgerFormat } from "../answer/evidenceLedgerContext";
import type { EvidenceLedgerEntry } from "../recall/evidenceLedger";

export type { EvidenceLedgerFormat } from "../answer/evidenceLedgerContext";

export interface EvidenceLedgerFormatResult {
  format: EvidenceLedgerFormat;
  macroScore: number;
  protectionDelta: number;
  averageTokens: number;
}

export function renderEvidenceLedger(
  entries: readonly EvidenceLedgerEntry[],
  format: EvidenceLedgerFormat,
  locale = "en",
): string {
  return renderEvidenceLedgerContext(entries, format, locale);
}

export function selectEvidenceLedgerFormat(
  results: readonly EvidenceLedgerFormatResult[],
): EvidenceLedgerFormat {
  const eligible = results.filter(({ protectionDelta }) =>
    protectionDelta >= -0.01
  );
  if (eligible.length === 0) {
    throw new Error("No evidence-ledger format passed the protection gate.");
  }
  const bestScore = Math.max(...eligible.map(({ macroScore }) => macroScore));
  return [...eligible]
    .filter(({ macroScore }) => macroScore + Number.EPSILON >= bestScore - 0.01)
    .sort(
      (left, right) =>
        left.averageTokens - right.averageTokens ||
        right.macroScore - left.macroScore ||
        left.format.localeCompare(right.format),
    )[0]!.format;
}
