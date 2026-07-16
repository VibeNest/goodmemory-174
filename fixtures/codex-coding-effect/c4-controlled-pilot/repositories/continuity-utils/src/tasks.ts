export function normalizeHost(value: string): string {
  return value;
}

export function parsePort(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535
    ? parsed
    : null;
}

export function formatEndpoint(host: string, port: number): string {
  return `${host}:${port}`;
}

export function splitAssignment(input: string): [string, string] | null {
  const [head, tail] = input.split("=");
  return head !== undefined && tail !== undefined ? [head, tail] : null;
}

export function splitHeader(input: string): [string, string] | null {
  const [head, tail] = input.split(":");
  return head !== undefined && tail !== undefined ? [head, tail] : null;
}

export function splitRoute(input: string): [string, string] | null {
  const [head, tail] = input.split("->");
  return head !== undefined && tail !== undefined ? [head, tail] : null;
}

export function stripConfigComment(input: string): string {
  return input.split("#")[0]!.trimEnd();
}

export function tokenizeCommand(input: string): string[] {
  return input.trim().split(/\s+/u);
}

export function parseCsvFields(input: string): string[] {
  return input.split(",").map((field) => field.trim());
}
