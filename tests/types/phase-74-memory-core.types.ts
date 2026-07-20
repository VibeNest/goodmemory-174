import type {
  ClaimProjection,
  EvidenceLedgerEntry,
  RecallPlan,
  SourceMessageRecord,
} from "../../src";

declare const claim: ClaimProjection;
declare const ledger: EvidenceLedgerEntry;
declare const plan: RecallPlan;
declare const source: SourceMessageRecord;

claim.predicateKey satisfies string;
ledger.temporalStatus satisfies "current" | "superseded" | "uncertain";
plan.preRankLimit satisfies number;
source.contentSha256 satisfies string;
