import { createHash } from "node:crypto";

export type EvalRunJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly EvalRunJsonValue[]
  | EvalRunJsonObject;

export interface EvalRunJsonObject {
  readonly [key: string]: EvalRunJsonValue;
}

export interface EvalRunModelIdentity {
  gateway: string;
  model: string;
  provider: string;
}

export interface EvalRunIdentityInput {
  answerModel: EvalRunModelIdentity;
  benchmark: string;
  configuration: EvalRunJsonObject;
  datasetSha256: string;
  generatedAt: string;
  generatedBy: string;
  judgeModel: EvalRunModelIdentity;
  promptSha256s: Readonly<Record<string, string>>;
  runId: string;
}

export interface EvalRunIdentity extends EvalRunIdentityInput {
  schemaVersion: 1;
}

export interface EvalRunIdentityPersistence {
  read(path: string): Promise<string | null>;
  create(path: string, content: string): Promise<void>;
}

export interface CreateOrMatchEvalRunIdentityOptions {
  identity: EvalRunIdentity;
  path: string;
  persistence: EvalRunIdentityPersistence;
}

export interface CreateOrMatchEvalRunIdentityResult {
  hash: string;
  status: "created" | "matched";
}

export function buildEvalRunIdentity(
  input: EvalRunIdentityInput,
): EvalRunIdentity {
  const identity: EvalRunIdentity = {
    answerModel: { ...input.answerModel },
    benchmark: input.benchmark,
    configuration: cloneJsonObject(input.configuration),
    datasetSha256: input.datasetSha256,
    generatedAt: input.generatedAt,
    generatedBy: input.generatedBy,
    judgeModel: { ...input.judgeModel },
    promptSha256s: { ...input.promptSha256s },
    runId: input.runId,
    schemaVersion: 1,
  };
  validateEvalRunIdentity(identity);
  return identity;
}

export function canonicalEvalRunIdentityJson(
  identity: EvalRunIdentity,
): string {
  validateEvalRunIdentity(identity);
  const { generatedAt: _generatedAt, ...comparableIdentity } = identity;
  return canonicalJson(comparableIdentity);
}

export function canonicalEvalExperimentIdentityJson(
  identity: EvalRunIdentity,
): string {
  validateEvalRunIdentity(identity);
  const {
    generatedAt: _generatedAt,
    runId: _runId,
    configuration,
    ...experimentIdentity
  } = identity;
  const { replicate: _replicate, ...experimentConfiguration } = configuration;
  return canonicalJson({
    ...experimentIdentity,
    configuration: experimentConfiguration,
  });
}

export function hashEvalRunIdentity(identity: EvalRunIdentity): string {
  return createHash("sha256")
    .update(canonicalEvalRunIdentityJson(identity))
    .digest("hex");
}

export function hashEvalExperimentIdentity(identity: EvalRunIdentity): string {
  return createHash("sha256")
    .update(canonicalEvalExperimentIdentityJson(identity))
    .digest("hex");
}

export async function createOrMatchEvalRunIdentity(
  options: CreateOrMatchEvalRunIdentityOptions,
): Promise<CreateOrMatchEvalRunIdentityResult> {
  const expectedJson = canonicalEvalRunIdentityJson(options.identity);
  const hash = createHash("sha256").update(expectedJson).digest("hex");
  const existingRaw = await options.persistence.read(options.path);

  if (existingRaw === null) {
    await options.persistence.create(
      options.path,
      `${JSON.stringify(options.identity, null, 2)}\n`,
    );
    return { hash, status: "created" };
  }

  let existing: unknown;
  try {
    existing = JSON.parse(existingRaw);
  } catch {
    throw new Error(`Invalid eval run identity at ${options.path}`);
  }

  validateEvalRunIdentity(existing);
  if (canonicalEvalRunIdentityJson(existing) !== expectedJson) {
    throw new Error(`Eval run identity drift at ${options.path}`);
  }

  return { hash, status: "matched" };
}

function validateEvalRunIdentity(
  value: unknown,
): asserts value is EvalRunIdentity {
  rejectIdentityCredentials(value);
  if (!isJsonObject(value) || value.schemaVersion !== 1) {
    throw new Error("Invalid eval run identity");
  }

  for (const key of [
    "benchmark",
    "datasetSha256",
    "generatedAt",
    "generatedBy",
    "runId",
  ] as const) {
    if (typeof value[key] !== "string" || value[key].trim() === "") {
      throw new Error("Invalid eval run identity");
    }
  }

  validateModelIdentity(value.answerModel);
  validateModelIdentity(value.judgeModel);
  if (
    value.answerModel.model.trim().toLowerCase() ===
    value.judgeModel.model.trim().toLowerCase()
  ) {
    throw new Error("Eval answer and judge models must be independent");
  }

  if (!isJsonObject(value.configuration)) {
    throw new Error("Invalid eval run identity");
  }
  canonicalJson(value.configuration);

  if (
    !isJsonObject(value.promptSha256s) ||
    Object.values(value.promptSha256s).some(
      (promptSha) => typeof promptSha !== "string" || promptSha.trim() === "",
    )
  ) {
    throw new Error("Invalid eval run identity");
  }
}

function validateModelIdentity(
  value: unknown,
): asserts value is EvalRunModelIdentity {
  if (
    !isJsonObject(value) ||
    typeof value.gateway !== "string" ||
    value.gateway.trim() === "" ||
    typeof value.model !== "string" ||
    value.model.trim() === "" ||
    typeof value.provider !== "string" ||
    value.provider.trim() === ""
  ) {
    throw new Error("Invalid eval run identity");
  }
}

function rejectIdentityCredentials(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      rejectIdentityCredentials(item);
    }
    return;
  }
  if (!isJsonObject(value)) {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = normalizeIdentityKey(key);
    if (normalizedKey.endsWith("apikey")) {
      throw new Error("Eval run identity must not contain API keys");
    }
    if (isCredentialFingerprintKey(normalizedKey)) {
      throw new Error(
        "Eval run identity must not contain credential-derived fingerprints",
      );
    }
    if (
      typeof child === "string" &&
      isProviderEndpointKey(normalizedKey) &&
      isCredentialBearingUrl(child)
    ) {
      throw new Error(
        "Eval run identity must not contain credential-bearing URLs",
      );
    }
    rejectIdentityCredentials(child);
  }
}

function normalizeIdentityKey(value: string): string {
  return value.replace(/[^a-z0-9]/giu, "").toLowerCase();
}

function isCredentialFingerprintKey(normalizedKey: string): boolean {
  const hasCredentialName = [
    "accesstoken",
    "apikey",
    "authtoken",
    "bearertoken",
    "clientsecret",
    "credential",
    "idtoken",
    "password",
    "privatekey",
    "refreshtoken",
    "secretkey",
  ].some((name) => normalizedKey.includes(name));
  const hasFingerprintName =
    normalizedKey.includes("digest") ||
    normalizedKey.includes("fingerprint") ||
    normalizedKey.includes("hash") ||
    /sha(?:1|224|256|384|512)/u.test(normalizedKey);
  return hasCredentialName && hasFingerprintName;
}

function isProviderEndpointKey(normalizedKey: string): boolean {
  return ["baseurl", "gateway", "provider"].some(
    (suffix) =>
      normalizedKey === suffix || normalizedKey.endsWith(suffix),
  );
}

function isCredentialBearingUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username !== "" || url.password !== "") {
    return true;
  }
  return [...url.searchParams.keys()].some((key) =>
    isSensitiveUrlParameter(key)
  );
}

function isSensitiveUrlParameter(value: string): boolean {
  const words = value
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((word) => word !== "");
  if (
    words.some((word) =>
      ["key", "password", "secret", "token"].includes(word)
    )
  ) {
    return true;
  }
  return [
    "accesstoken",
    "apikey",
    "authtoken",
    "bearertoken",
    "clientsecret",
    "idtoken",
    "privatekey",
    "refreshtoken",
    "secretkey",
  ].includes(normalizeIdentityKey(value));
}

function cloneJsonObject(value: EvalRunJsonObject): EvalRunJsonObject {
  return cloneJsonValue(value) as EvalRunJsonObject;
}

function cloneJsonValue(value: EvalRunJsonValue): EvalRunJsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => cloneJsonValue(item));
  }
  if (isJsonObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        cloneJsonValue(child),
      ]),
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Eval run identity must contain JSON-compatible metadata");
  }
  return value;
}

function canonicalJson(value: unknown, seen = new WeakSet<object>()): string {
  if (value === null || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(
        "Eval run identity must contain JSON-compatible metadata",
      );
    }
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new Error("Eval run identity must contain JSON-compatible metadata");
  }
  if (seen.has(value)) {
    throw new Error("Eval run identity must contain JSON-compatible metadata");
  }
  seen.add(value);

  let canonical: string;
  if (Array.isArray(value)) {
    canonical = `[${value.map((item) => canonicalJson(item, seen)).join(",")}]`;
  } else {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0
    );
    canonical = `{${entries.map(([key, child]) =>
      `${JSON.stringify(key)}:${canonicalJson(child, seen)}`
    ).join(",")}}`;
  }

  seen.delete(value);
  return canonical;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
