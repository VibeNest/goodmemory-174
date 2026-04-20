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
