// Evolution records (SessionArchive, ExperienceRecord, LearningProposal,
// PromotionRecord), their enums, collection constants, and pure constructors
// now live in the domain leaf (domain/evolutionRecords.ts) so that lower layers
// — storage, runtime, recall — can depend on them without importing the
// evolution feature module. This file re-exports them for backward
// compatibility and for evolution-internal use. See ADR-006.
export * from "../domain/evolutionRecords";
