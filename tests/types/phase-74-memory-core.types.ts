import type {
  ClaimProjection,
  EvidenceLedgerEntry,
  RecallPlan,
  RememberPipelineResult,
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

const legacyRememberResult = {
  accepted: 0,
  events: [],
  rejected: 0,
} satisfies RememberPipelineResult;
legacyRememberResult.accepted satisfies number;
