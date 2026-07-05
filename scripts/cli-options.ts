import { resolve } from "node:path";

export function resolveCliFlagValue(
  argv: readonly string[],
  flag: string,
): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    return undefined;
  }

  return value;
}

export function assertDistinctCliPathValues(input: {
  firstFlag: string;
  firstValue: string;
  secondFlag: string;
  secondValue: string;
}): void {
  if (resolve(input.firstValue) !== resolve(input.secondValue)) {
    return;
  }

  throw new Error(
    `${input.firstFlag} and ${input.secondFlag} must refer to different paths; ` +
      `${input.secondValue} resolves to the same path as ${input.firstValue}.`,
  );
}

export function parseCliPathListFlagStrict(
  argv: readonly string[],
  flag: string,
): string[] {
  const values: string[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== flag) {
      continue;
    }

    const raw = argv[index + 1];
    if (!raw || raw.startsWith("--")) {
      throw new Error(`${flag} requires a value.`);
    }

    for (const value of raw.split(",")) {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        throw new Error(`${flag} contains an empty value.`);
      }
      if (trimmed !== value) {
        throw new Error(`${flag} contains whitespace-padded value ${trimmed}.`);
      }

      const normalizedPath = resolve(value);
      if (seen.has(normalizedPath)) {
        throw new Error(`${flag} contains duplicate value ${value}.`);
      }
      seen.add(normalizedPath);
      values.push(value);
    }

    index += 1;
  }

  return values;
}

export function parseCliPositiveIntegerFlagStrict(
  argv: readonly string[],
  flag: string,
): number | undefined {
  const raw = resolveCliFlagValueStrict(argv, flag);
  if (raw === undefined) {
    return undefined;
  }

  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(`${flag} must be a positive integer.`);
  }

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${flag} must be a positive integer.`);
  }

  return parsed;
}

export function hasCliFlagStrict(argv: readonly string[], flag: string): boolean {
  let found = false;
  for (const value of argv) {
    if (value !== flag) {
      continue;
    }
    if (found) {
      throw new Error(`${flag} cannot be specified more than once.`);
    }
    found = true;
  }
  return found;
}

export function resolveCliFlagValueStrict(
  argv: readonly string[],
  flag: string,
): string | undefined {
  let value: string | undefined;
  let found = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== flag) {
      continue;
    }
    if (found) {
      throw new Error(`${flag} cannot be specified more than once.`);
    }
    found = true;
    value = argv[index + 1];
  }

  if (!found) {
    return undefined;
  }

  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  if (value.trim().length === 0 || value.trim() !== value) {
    throw new Error(`${flag} cannot be empty or whitespace-padded.`);
  }

  return value;
}

export function resolveEnvValueStrict(
  env: Record<string, string | undefined>,
  name: string,
): string | undefined {
  const value = env[name];
  if (value === undefined) {
    return undefined;
  }
  if (value.trim().length === 0 || value.trim() !== value) {
    throw new Error(`${name} cannot be empty or whitespace-padded.`);
  }
  return value;
}

export function assertCliPathSegmentValue(input: {
  flag: string;
  value: string;
}): void {
  if (
    input.value === "." ||
    input.value === ".." ||
    /[\\/]/u.test(input.value)
  ) {
    throw new Error(`${input.flag} must be a single path segment.`);
  }
}

export function resolveCliPathSegmentFlagValueStrict(
  argv: readonly string[],
  flag: string,
): string | undefined {
  const value = resolveCliFlagValueStrict(argv, flag);
  if (value === undefined) {
    return undefined;
  }

  assertCliPathSegmentValue({ flag, value });
  return value;
}
