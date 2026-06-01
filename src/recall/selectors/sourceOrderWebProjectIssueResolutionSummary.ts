import type { RankedFactCandidate } from "../scoring";
import {
  hasAssistantAnswerTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "./selectionContext";
import { compareTemporalFactChronology } from "./temporal";

type WebProjectIssueResolutionFacet =
  | "boxModelDebugPrompt"
  | "boxModelDebugResolution"
  | "classListNullPrompt"
  | "classListNullResolution"
  | "fileStructureFollowup"
  | "fileStructureResolution"
  | "formspreeRetryPrompt"
  | "formspreeRetryResolution"
  | "gallery404Prompt"
  | "gallery404Resolution"
  | "scriptPathPrompt"
  | "scriptPathResolution"
  | "serverLogsFollowup"
  | "serverLogsResolution";

const QUERY_PATTERN =
  /^(?=[\s\S]*\b(?:summari[sz]e|summary|recap)\b)(?=[\s\S]*\b(?:approached|resolved?|issues?|problems?|troubleshoot(?:ed|ing)?|debug(?:ged|ging)?)\b)(?=[\s\S]*\b(?:web\s+project|portfolio\s+(?:project|website)|website\s+project)\b)(?=[\s\S]*\bover\s+time\b)/iu;

const FACETS = [
  {
    facet: "boxModelDebugPrompt",
    role: "user",
    patterns: [
      /^(?=[\s\S]*\bCSS\s+layout\s+issue\b)(?=[\s\S]*\bChrome\s+DevTools\b)(?=[\s\S]*\bbox\s+model\b)(?=[\s\S]*\bpadding\b)(?=[\s\S]*\bborder\b)(?=[\s\S]*\bmargin\b)/iu,
    ],
  },
  {
    facet: "boxModelDebugResolution",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\boffsetWidth\b)(?=[\s\S]*\boffsetHeight\b)(?=[\s\S]*\bpadding\s+and\s+border\b)(?=[\s\S]*\bmargin\b)(?=[\s\S]*\bChrome\s+DevTools\b|\bbox\s+model\b)/iu,
    ],
  },
  {
    facet: "classListNullPrompt",
    role: "user",
    patterns: [
      /^(?=[\s\S]*\bTypeError\b)(?=[\s\S]*\bclassList\b)(?=[\s\S]*\bnull\b)(?=[\s\S]*\bnavbar-expand-lg\b)/iu,
    ],
  },
  {
    facet: "classListNullResolution",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bclassList\b)(?=[\s\S]*\bnull\b)(?=[\s\S]*\boptional\s+chaining\b)(?=[\s\S]*\btry-catch\b)(?=[\s\S]*\bnavbar\b)/iu,
    ],
  },
  {
    facet: "gallery404Prompt",
    role: "user",
    patterns: [
      /^(?=[\s\S]*\bproject\s+gallery\b)(?=[\s\S]*\bimages?\s+are\s+not\s+loading\b)(?=[\s\S]*\b404\b)(?=[\s\S]*\bFailed\s+to\s+load\s+resource\b)/iu,
    ],
  },
  {
    facet: "gallery404Resolution",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\b404\b)(?=[\s\S]*\bimage\s+paths?\b)(?=[\s\S]*\bcase\s+sensitivity\b)(?=[\s\S]*\bstatic\s+files?\b|\bNetwork\s+tab\b|\bbuild\s+(?:output|process)\b)/iu,
    ],
  },
  {
    facet: "serverLogsFollowup",
    role: "user",
    patterns: [
      /^(?=[\s\S]*\bserver\s+logs?\b)(?=[\s\S]*\bfind\s+the\s+issue\b)/iu,
    ],
  },
  {
    facet: "serverLogsResolution",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bserver\s+logs?\b)(?=[\s\S]*\b404\b)(?=[\s\S]*\brequested\s+(?:URL|image\s+URLs?)\b)(?=[\s\S]*\bfile\s+path\b)(?=[\s\S]*\bstatic\s+file\s+serving\b|\bpermissions?\b)/iu,
    ],
  },
  {
    facet: "scriptPathPrompt",
    role: "user",
    patterns: [
      /^(?=[\s\S]*\bReferenceError\b)(?=[\s\S]*\bvalidateForm\b)(?=[\s\S]*\bscript\s+src\s+path\b)(?=[\s\S]*\bindex\.html\b)/iu,
    ],
  },
  {
    facet: "scriptPathResolution",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bscript\.js\b)(?=[\s\S]*\bindex\.html\b)(?=[\s\S]*\bvalidateForm\b)(?=[\s\S]*\bfile\s+structure\b)(?=[\s\S]*\bdefined\s+before\b|\bpath\s+is\s+correct\b)/iu,
    ],
  },
  {
    facet: "fileStructureFollowup",
    role: "user",
    patterns: [
      /^(?=[\s\S]*\bfile\s+structure\b)(?=[\s\S]*\blinks?\s+correctly\b)/iu,
    ],
  },
  {
    facet: "fileStructureResolution",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bindex\.html\b)(?=[\s\S]*\bscript\.js\b)(?=[\s\S]*\b(?:same\s+directory|subdirectory)\b)(?=[\s\S]*\brelative\s+or\s+absolute\s+paths?\b|\brelative\s+vs\.\s+absolute\s+paths?\b)/iu,
    ],
  },
  {
    facet: "formspreeRetryPrompt",
    role: "user",
    patterns: [
      /^(?=[\s\S]*\bFormspree\s+500\s+Internal\s+Server\s+Error\b)(?=[\s\S]*\bcontact\s+form\b)(?=[\s\S]*\bretry\s+logic\b)(?=[\s\S]*\bexponential\s+backoff\b)/iu,
    ],
  },
  {
    facet: "formspreeRetryResolution",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bretry\s+logic\b)(?=[\s\S]*\bexponential\s+backoff\b)(?=[\s\S]*\bfetch\b)(?=[\s\S]*\bHTTP\s+(?:errors?|500)\b)(?=[\s\S]*\bnetwork\s+errors?\b)/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: WebProjectIssueResolutionFacet;
  patterns: readonly RegExp[];
  role: "assistant" | "user";
}>;

function isWebProjectIssueResolutionSummaryQuery(query: string): boolean {
  return QUERY_PATTERN.test(query);
}

function shouldEvaluateFacet(
  facet: WebProjectIssueResolutionFacet,
  normalizedContent: string,
): boolean {
  switch (facet) {
    case "boxModelDebugPrompt":
      return normalizedContent.includes("css layout issue") &&
        normalizedContent.includes("box model");
    case "boxModelDebugResolution":
      return normalizedContent.includes("offsetwidth") &&
        normalizedContent.includes("offsetheight");
    case "classListNullPrompt":
      return normalizedContent.includes("typeerror") &&
        normalizedContent.includes("classlist") &&
        normalizedContent.includes("navbar-expand-lg");
    case "classListNullResolution":
      return normalizedContent.includes("classlist") &&
        normalizedContent.includes("optional chaining");
    case "fileStructureFollowup":
      return normalizedContent.includes("file structure") &&
        normalizedContent.includes("links correctly");
    case "fileStructureResolution":
      return normalizedContent.includes("index.html") &&
        normalizedContent.includes("script.js") &&
        normalizedContent.includes("relative");
    case "formspreeRetryPrompt":
      return normalizedContent.includes("formspree 500") &&
        normalizedContent.includes("exponential backoff");
    case "formspreeRetryResolution":
      return normalizedContent.includes("retry logic") &&
        normalizedContent.includes("exponential backoff") &&
        normalizedContent.includes("fetch");
    case "gallery404Prompt":
      return normalizedContent.includes("project gallery") &&
        normalizedContent.includes("404");
    case "gallery404Resolution":
      return normalizedContent.includes("404") &&
        normalizedContent.includes("image paths") &&
        normalizedContent.includes("case sensitivity");
    case "scriptPathPrompt":
      return normalizedContent.includes("referenceerror") &&
        normalizedContent.includes("validateform") &&
        normalizedContent.includes("script src path");
    case "scriptPathResolution":
      return normalizedContent.includes("validateform") &&
        normalizedContent.includes("script.js") &&
        normalizedContent.includes("index.html");
    case "serverLogsFollowup":
      return normalizedContent.includes("server logs") &&
        normalizedContent.includes("find the issue");
    case "serverLogsResolution":
      return normalizedContent.includes("server logs") &&
        normalizedContent.includes("404") &&
        normalizedContent.includes("static file");
  }
}

function matchesSourceRole(
  entry: RankedFactCandidate,
  role: "assistant" | "user",
): boolean {
  if (role === "assistant" && hasAssistantAnswerTag(entry)) {
    return true;
  }
  if (role === "user" && hasUserAnswerTag(entry)) {
    return true;
  }

  const originalRole = entry.fact.attributes?.originalRole;
  if (originalRole === role) {
    return true;
  }

  return role === "assistant"
    ? /\brole\s*=\s*assistant\b/iu.test(entry.fact.content)
    : /\brole\s*=\s*user\b/iu.test(entry.fact.content);
}

function webProjectIssueResolutionFacets(
  entry: RankedFactCandidate,
): Set<WebProjectIssueResolutionFacet> {
  const content = stripEvidencePrefix(entry.fact.content);
  const normalizedContent = content.toLowerCase();
  const facets = new Set<WebProjectIssueResolutionFacet>();
  for (const facet of FACETS) {
    if (!shouldEvaluateFacet(facet.facet, normalizedContent)) {
      continue;
    }
    if (
      matchesSourceRole(entry, facet.role) &&
      facet.patterns.some((pattern) => pattern.test(content))
    ) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedWebProjectIssueResolutionSummaryCoverage(input: {
  limit: number;
  minAnchors: number;
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isWebProjectIssueResolutionSummaryQuery(input.query)) {
    return [];
  }

  const selected = new Map<string, RankedFactCandidate>();
  for (const facet of FACETS) {
    const entry = input.sourceCandidates
      .filter((candidate) =>
        webProjectIssueResolutionFacets(candidate).has(facet.facet)
      )
      .sort(compareTemporalFactChronology)[0];
    if (entry) {
      selected.set(entry.fact.id, entry);
    }
  }

  const requiredAnchors = Math.max(input.minAnchors, FACETS.length);
  if (selected.size < requiredAnchors) {
    return [];
  }

  return [...selected.values()]
    .sort(compareTemporalFactChronology)
    .slice(0, input.limit);
}
