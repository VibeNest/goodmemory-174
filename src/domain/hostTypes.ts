// Cross-cutting host enums. They live in domain/ (a dependency leaf) so that
// both the host integration surface and the api layer can reference them
// without api needing to import host/ — keeping api ↛ host acyclic.
// See architecture.boundaries.test.ts.

export type HostKind = "generic" | "claude" | "codex";

export type HostActionDecision =
  | "allow"
  | "allow_with_guidance"
  | "review_required"
  | "blocked";
