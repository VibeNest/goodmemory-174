export const PHASE72_ANSWER_MODEL = "gpt-5.6-terra";
export const PHASE72_ANSWER_GATEWAY = "https://ai.gurkiai.com/v1";
export const PHASE72_INDEPENDENT_JUDGE_MODEL = "gpt-5.4";

export const PHASE72_UPSTREAMS = {
  halumem: {
    codeCommit: "c29025f43b347f68fc36a06bee8ed29b4dc6c3fb",
    codeLicense: "CC-BY-NC-ND-4.0",
    codeLicenseEvidence: "README badge; no root LICENSE file",
    datasetLicense: "CC-BY-NC-ND-4.0",
    repository: "https://github.com/MemTensor/HaluMem",
  },
  memgym: {
    codeCommit: "50b404e6ae4e1fcd453d3e07963eb3e6312cbded",
    codeLicense: "Apache-2.0",
    codeQaAvailability: "pending",
    repository: "https://github.com/WujiangXu/MemGym",
  },
  minteval: {
    codeCommit: "3dd82be34f4b82d90829bd5572b1e3950cb2f731",
    codeLicense: "unresolved",
    datasetLicense: "CC-BY-4.0",
    datasetRevision: "9b9c5befc5126a4ca0fd88cc03c03260142a0883",
    historicalName: "LongMINT",
    repository: "https://github.com/amy-hyunji/MINTEval",
  },
} as const;

export interface Phase72ExternalBoundary {
  answer: {
    gateway: string;
    model: string;
    role: "memory-and-answer";
  };
  judge: {
    gateway: string;
    model: string;
    role: "independent-judge";
  };
  halumem: {
    claimScope: "frozen-slice";
    codeCommit: string;
    codeCopiedIntoPackage: boolean;
    datasetRedistributed: boolean;
    rawArtifactsTracked: boolean;
  };
  memgym: {
    claimScope: "generated-slice-only" | "public-full-dataset";
    codeCommit: string;
    source: "upstream-generated-slice" | "official-public-codeqa";
  };
  minteval: {
    codeCommit: string;
    datasetRevision: string;
    mode: "smoke-only" | "scored-claim";
    name: "MINTEval";
  };
}

export interface Phase72ExternalBoundaryResult {
  failures: string[];
  status: "failed" | "passed";
}

export function createPhase72ExternalBoundary(): Phase72ExternalBoundary {
  return {
    answer: {
      gateway: PHASE72_ANSWER_GATEWAY,
      model: PHASE72_ANSWER_MODEL,
      role: "memory-and-answer",
    },
    judge: {
      gateway: PHASE72_ANSWER_GATEWAY,
      model: PHASE72_INDEPENDENT_JUDGE_MODEL,
      role: "independent-judge",
    },
    halumem: {
      claimScope: "frozen-slice",
      codeCommit: PHASE72_UPSTREAMS.halumem.codeCommit,
      codeCopiedIntoPackage: false,
      datasetRedistributed: false,
      rawArtifactsTracked: false,
    },
    memgym: {
      claimScope: "generated-slice-only",
      codeCommit: PHASE72_UPSTREAMS.memgym.codeCommit,
      source: "upstream-generated-slice",
    },
    minteval: {
      codeCommit: PHASE72_UPSTREAMS.minteval.codeCommit,
      datasetRevision: PHASE72_UPSTREAMS.minteval.datasetRevision,
      mode: "smoke-only",
      name: "MINTEval",
    },
  };
}

export function evaluatePhase72ExternalBoundary(
  boundary: Phase72ExternalBoundary,
): Phase72ExternalBoundaryResult {
  const failures: string[] = [];
  if (
    boundary.answer.model !== PHASE72_ANSWER_MODEL ||
    boundary.answer.gateway !== PHASE72_ANSWER_GATEWAY
  ) {
    failures.push("new non-judge calls must use the pinned Phase 72 answer model");
  }
  if (boundary.judge.model === boundary.answer.model) {
    failures.push("answer model must not judge its own output");
  }
  if (
    boundary.halumem.codeCommit !== PHASE72_UPSTREAMS.halumem.codeCommit
  ) {
    failures.push("HaluMem upstream commit is not pinned");
  }
  if (
    boundary.halumem.codeCopiedIntoPackage ||
    boundary.halumem.datasetRedistributed
  ) {
    failures.push("HaluMem source or dataset content cannot ship in the package");
  }
  if (boundary.halumem.rawArtifactsTracked) {
    failures.push("HaluMem raw evaluation artifacts cannot be tracked");
  }
  if (boundary.memgym.codeCommit !== PHASE72_UPSTREAMS.memgym.codeCommit) {
    failures.push("MemGym upstream commit is not pinned");
  }
  if (
    boundary.memgym.claimScope !== "generated-slice-only" ||
    boundary.memgym.source !== "upstream-generated-slice"
  ) {
    failures.push("MemGym CodeQA evidence must remain a generated slice");
  }
  if (
    boundary.minteval.codeCommit !== PHASE72_UPSTREAMS.minteval.codeCommit
  ) {
    failures.push("MINTEval upstream commit is not pinned");
  }
  if (
    boundary.minteval.datasetRevision !==
    PHASE72_UPSTREAMS.minteval.datasetRevision
  ) {
    failures.push("MINTEval dataset revision is not pinned");
  }
  if (boundary.minteval.mode !== "smoke-only") {
    failures.push("MINTEval is smoke-only in Phase 72");
  }
  return {
    failures,
    status: failures.length === 0 ? "passed" : "failed",
  };
}
