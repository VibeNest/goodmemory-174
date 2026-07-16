export function renderHostDisplay(host: string): string {
  return host;
}

export function renderEndpointDisplay(host: string, port: number): string {
  return `${host}:${port}`;
}

export function renderTargetDisplay(target: string, host: string, port: number): string {
  return `${target} ${host}:${port}`;
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

export function parseCsvFields(input: string): string[] {
  return input.split(",").map((field) => field.trim());
}

export function parsePipeFields(input: string): string[] {
  return input.split("|").map((field) => field.trim());
}

export function parseSemicolonFields(input: string): string[] {
  return input.split(";").map((field) => field.trim());
}
