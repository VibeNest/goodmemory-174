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

  return value;
}
