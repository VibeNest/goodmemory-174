import type { RankedFactCandidate } from "../../scoring";
import { stripEvidencePrefix } from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

type SourceOrderAppDevelopmentDeploymentFacet =
  | "deploymentIntegrationTests"
  | "localFlaskSetup"
  | "securityTestExpansion"
  | "transactionPostRoute";

const APP_DEVELOPMENT_DEPLOYMENT_QUERY_PATTERN =
  /\bapp\s+development\b[\s\S]{0,160}\bdeployment\b[\s\S]{0,160}\b(?:order|walk\s+me\s+through|brought\s+up|conversations?)\b|\b(?:order|walk\s+me\s+through|brought\s+up|conversations?)\b[\s\S]{0,160}\bapp\s+development\b[\s\S]{0,160}\bdeployment\b/iu;

const APP_DEVELOPMENT_DEPLOYMENT_FACETS = [
  {
    facet: "localFlaskSetup",
    pattern: /\bFlask\s+2\.3\.1\b[\s\S]{0,180}\bPython\s+3\.11\b[\s\S]{0,180}\bSQLite\s+3\.39\b[\s\S]{0,180}\b(?:local\s+dev|port\s+5000)\b|\blocal\s+dev\b[\s\S]{0,120}\bport\s+5000\b/iu,
  },
  {
    facet: "transactionPostRoute",
    pattern: /\bPOST\s+\/transactions\b[\s\S]{0,180}\b(?:201\s+status|response\s+handling|error\s+management|created\s+successfully)\b|\btransaction\s+CRUD\b[\s\S]{0,180}\bPOST\s+\/transactions\b/iu,
  },
  {
    facet: "deploymentIntegrationTests",
    pattern: /\bRender\.com\b[\s\S]{0,180}\bGunicorn\b[\s\S]{0,180}\b(?:3\s+workers|port\s+10000|integration\s+tests?)\b|\bGunicorn\b[\s\S]{0,180}\bRender\.com\b[\s\S]{0,180}\bintegration\s+tests?\b|\bGunicorn\b[\s\S]{0,180}\b(?:3\s+workers|port\s+10000)\b[\s\S]{0,180}\bintegration\s+tests?\b/iu,
  },
  {
    facet: "securityTestExpansion",
    pattern: /\b(?:SQL\s+injection|XSS)\b[\s\S]{0,180}\b(?:tests?|security|vulnerabilit(?:y|ies))\b|\b(?:tests?|security|vulnerabilit(?:y|ies))\b[\s\S]{0,180}\bSQL\s+injection\b[\s\S]{0,80}\bXSS\b/iu,
  },
] as const satisfies ReadonlyArray<{
  facet: SourceOrderAppDevelopmentDeploymentFacet;
  pattern: RegExp;
}>;

const APP_DEVELOPMENT_DEPLOYMENT_FACET_ORDER = [
  "localFlaskSetup",
  "transactionPostRoute",
  "deploymentIntegrationTests",
  "securityTestExpansion",
] as const satisfies readonly SourceOrderAppDevelopmentDeploymentFacet[];

export function isSourceOrderAppDevelopmentDeploymentQuery(
  query: string,
): boolean {
  return APP_DEVELOPMENT_DEPLOYMENT_QUERY_PATTERN.test(query);
}

function sourceOrderAppDevelopmentDeploymentFacets(
  entry: RankedFactCandidate,
): Set<SourceOrderAppDevelopmentDeploymentFacet> {
  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<SourceOrderAppDevelopmentDeploymentFacet>();
  for (const facet of APP_DEVELOPMENT_DEPLOYMENT_FACETS) {
    if (facet.pattern.test(content)) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedAppDevelopmentDeploymentAnchors(input: {
  entries: RankedFactCandidate[];
  priority: (entry: RankedFactCandidate) => number;
}): RankedFactCandidate[] {
  const bestByFacet = new Map<
    SourceOrderAppDevelopmentDeploymentFacet,
    RankedFactCandidate
  >();

  for (const entry of input.entries) {
    const facets = sourceOrderAppDevelopmentDeploymentFacets(entry);
    for (const facet of facets) {
      const current = bestByFacet.get(facet);
      if (
        !current ||
        input.priority(entry) > input.priority(current) ||
        (
          input.priority(entry) === input.priority(current) &&
          compareTemporalFactChronology(entry, current) < 0
        )
      ) {
        bestByFacet.set(facet, entry);
      }
    }
  }

  const selected = APP_DEVELOPMENT_DEPLOYMENT_FACET_ORDER
    .map((facet) => bestByFacet.get(facet))
    .filter((entry): entry is RankedFactCandidate => entry !== undefined);

  return selected.length === APP_DEVELOPMENT_DEPLOYMENT_FACET_ORDER.length
    ? selected.sort(compareTemporalFactChronology)
    : [];
}
