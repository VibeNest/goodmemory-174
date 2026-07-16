export type ParseResult<T> =
  | { ok: true; value: T }
  | { error: string; ok: false };

export type TransportMode = "direct" | "relay";

export const SETTING_ERROR_CODES = {
  boolean: "invalid-boolean",
  integer: "invalid-integer",
  mode: "invalid-mode",
} as const;

export function parseBooleanSetting(input: string): ParseResult<boolean> {
  return { ok: true, value: input === "true" };
}

export function parseIntegerSetting(input: string): ParseResult<number> {
  return { ok: true, value: Number(input) };
}

export function parseModeSetting(input: string): ParseResult<TransportMode> {
  return { ok: true, value: input as TransportMode };
}

export function timeoutToMs(seconds: number): number {
  return seconds;
}

export function scheduleToMs(input: { initialSeconds: number; maxSeconds: number }): { initialMs: number; maxMs: number } {
  return { initialMs: input.initialSeconds, maxMs: input.maxSeconds };
}

export function deadlineFromConfig(startMs: number, timeoutSeconds: number): number {
  return startMs + timeoutSeconds;
}

export function slugify(value: string): string {
  return value.toLowerCase().replace(" ", "-");
}

export function parseCsvUnique(input: string): string[] {
  return input.split(",");
}

export function encodePathSegment(value: string): string {
  return encodeURI(value);
}
