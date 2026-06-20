// Static fixture data for the ImplicitMemBench research harness: stop-word
// sets, analogy markers, and explicit-recall leak patterns. Extracted from
// implicitmembench-research.ts so the (large) harness file stays focused on
// scoring/execution logic rather than inlined data tables. A down-payment
// toward fully splitting that eval file (data / scorer / executor / reporter).

import type { LatentPrimingSemanticField } from "./implicitmembench-research";

export const ACTION_NAME_STOP_WORDS = new Set([
  "calling",
  "checking",
  "creating",
  "dispatching",
  "enqueuing",
  "executing",
  "generating",
  "invoking",
  "performing",
  "processing",
  "running",
  "sending",
  "starting",
  "submitting",
  "triggering",
]);

export const ANALOGY_MARKERS = [
  "analogy",
  "as if",
  "imagine",
  "like",
  "similar to",
  "think of",
] as const;

export const EXPLICIT_RECALL_LEAK_PATTERNS = [
  /\b(?:i|we)\s+(?:remember|remembered)\b/iu,
  /\bremember\s+that\b/iu,
  /\b(?:based on|from)\s+(?:earlier|previous)\s+(?:messages?|notes?|examples?|instructions?)\b/iu,
  /\b(?:earlier|previous)\s+(?:messages?|notes?|examples?|instructions?)\b/iu,
  /\bmemory\s+notes?\b/iu,
  /\b(?:according to|based on|from|using)\s+(?:my|our|the\s+)?memory\b/iu,
  /\b(?:my|our|the)\s+memory\s+(?:contains?|has|indicates?|reminds?|says?|shows?|suggests?|tells?)\b/iu,
  /\bmemory\s+(?:context|entries|entry|guidance|records?|says?|signals?|suggests?)\b/iu,
  /\b(?:learned|remembered)\s+(?:rule|rules|pattern|patterns|behavior|behaviors|instruction|instructions|note|notes|example|examples)\b/iu,
] as const;

export const LATENT_PRIMING_STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "answer",
  "branch",
  "candidate",
  "candidates",
  "codename",
  "codenames",
  "commentary",
  "control",
  "earlier",
  "exactly",
  "experimental",
  "following",
  "format",
  "from",
  "group",
  "include",
  "including",
  "layer",
  "layered",
  "layers",
  "many",
  "message",
  "messages",
  "metaphor",
  "nouns",
  "order",
  "ordered",
  "orderly",
  "output",
  "phase",
  "plain",
  "probe",
  "prompt",
  "rationale",
  "reuse",
  "simple",
  "single",
  "source",
  "strict",
  "task",
  "that",
  "their",
  "there",
  "these",
  "those",
  "theme",
  "three",
  "through",
  "this",
  "under",
  "with",
  "without",
]);

export interface SafePrimingCandidate {
  codename: string;
  rationale: string;
}

export const SAFE_PRIMING_CANDIDATES = {
  abyssal_depth: [
    {
      codename: "Keel",
      rationale:
        "Suggests steady bearing, trimming excess while holding course through long unsettled passages.",
    },
    {
      codename: "Ballast",
      rationale:
        "Conveys deliberate settling, packing weight efficiently so motion stays measured and unhurried.",
    },
    {
      codename: "Caisson",
      rationale:
        "Implies compact strength beneath surfaces, supporting immense load with disciplined economical design.",
    },
  ],
  alchemy_transformation: [
    {
      codename: "Athanor",
      rationale:
        "Steady heat compresses scattered substance, leaving a cleaner, rarer form.",
    },
    {
      codename: "Cinnabar",
      rationale:
        "A dark mineral brightens by stages, turning disorder into concentrated value.",
    },
    {
      codename: "Nigredo",
      rationale:
        "Initial darkness becomes useful order after pressure and disciplined craft.",
    },
  ],
  arctic_survival: [
    {
      codename: "Rimehold",
      rationale:
        "It suggests severe conditions condensed into a resilient, sheltered core.",
    },
    {
      codename: "Borealkeep",
      rationale:
        "It evokes pale distance narrowed by discipline, warmth, and forward resolve.",
    },
    {
      codename: "Whiteout",
      rationale:
        "It frames confusion becoming sparse guidance across a hard blank field.",
    },
  ],
  cathedral_structure: [
    {
      codename: "Clerestory",
      rationale:
        "It suggests uplifted structure channeling scattered light into a unified span.",
    },
    {
      codename: "Buttress",
      rationale:
        "It evokes quiet support, holding great weight while leaving graceful openness.",
    },
    {
      codename: "Reliquary",
      rationale:
        "It frames precious fragments gathered into a reverent, durable enclosure.",
    },
  ],
  espionage_intrigue: [
    {
      codename: "Deadrop",
      rationale:
        "It suggests discreet transfer, hiding dense value inside an ordinary exchange.",
    },
    {
      codename: "Tradecraft",
      rationale:
        "It evokes careful misdirection, where every small move carries concealed intent.",
    },
    {
      codename: "Coverline",
      rationale:
        "It frames secrecy as a narrow path that keeps essentials protected.",
    },
  ],
  jazz_improvisation: [
    {
      codename: "Backbeat",
      rationale:
        "It suggests lively timing, tightening fragments into a responsive shared pulse.",
    },
    {
      codename: "Bluebreak",
      rationale:
        "It evokes expressive variation, bending spare material into memorable motion.",
    },
    {
      codename: "Riffline",
      rationale:
        "It frames compact invention as a quick phrase that invites reply.",
    },
  ],
  mycelium_network: [
    {
      codename: "Rhizome",
      rationale:
        "It suggests quiet linkage, distributing small resources through an unseen living grid.",
    },
    {
      codename: "Underweave",
      rationale:
        "It evokes hidden connectivity, drawing scattered pieces into mutual support.",
    },
    {
      codename: "Symbiote",
      rationale:
        "It frames compact growth as cooperation spreading through subtle channels.",
    },
  ],
  neutral: [
    {
      codename: "Ledgerline",
      rationale:
        "It suggests careful tracking where scattered readings stay clear, compact, and comparable.",
    },
    {
      codename: "Gridmark",
      rationale:
        "It evokes measured placement, turning dispersed pieces into a tidy visible pattern.",
    },
    {
      codename: "Plainstack",
      rationale:
        "It frames useful reduction as clean layers arranged for quick inspection.",
    },
  ],
  oracle_prophecy: [
    {
      codename: "Portentline",
      rationale:
        "It suggests tomorrow arriving as a quiet sign gathered before choices harden.",
    },
    {
      codename: "Augurglass",
      rationale:
        "It evokes uncertain futures clarifying through restraint, patience, and careful interpretation.",
    },
    {
      codename: "Vowcast",
      rationale:
        "It frames hidden consequence as a solemn signal drawn into one name.",
    },
  ],
  orbital_motion: [
    {
      codename: "Barycenter",
      rationale:
        "Shared tension gathers scattered mass, keeping compact motion near a steady center.",
    },
    {
      codename: "Libration",
      rationale:
        "A slight wobble becomes disciplined recurrence, conserving effort through balanced return.",
    },
    {
      codename: "Apsis",
      rationale:
        "A far swing tightens at the edge, saving energy through curved timing.",
    },
  ],
  volcanic_release: [
    {
      codename: "Caldera",
      rationale:
        "It suggests a stored surge narrowing into a smaller, forceful shape.",
    },
    {
      codename: "Cinderloom",
      rationale:
        "It evokes glowing fragments woven tightly, preserving spark while reducing scattered motion.",
    },
    {
      codename: "Mantlelock",
      rationale:
        "It frames dense material settling inward before a decisive outward pulse.",
    },
  ],
} as const satisfies Record<
  LatentPrimingSemanticField,
  readonly SafePrimingCandidate[]
>;
