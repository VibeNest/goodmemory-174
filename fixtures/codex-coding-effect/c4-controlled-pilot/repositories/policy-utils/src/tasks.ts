export type ParseResult<T> =
  | { ok: true; value: T }
  | { error: string; ok: false };

export type LogLevel = "debug" | "info" | "warn";

export type OutputFormat = "json" | "text" | "yaml";

export type TransportMode = "buffered" | "direct" | "relay";

export const SETTING_ERROR_CODES = {
  format: "invalid-format",
  level: "invalid-level",
  mode: "invalid-mode",
} as const;

export function parseModeSetting(input: string): ParseResult<TransportMode> {
  return { ok: true, value: input as TransportMode };
}

export function parseLogLevelSetting(input: string): ParseResult<LogLevel> {
  return { ok: true, value: input as LogLevel };
}

export function parseOutputFormatSetting(input: string): ParseResult<OutputFormat> {
  return { ok: true, value: input as OutputFormat };
}

export function resolveTimeoutConfig(input: { graceMs: number; timeout: number }): { graceMs: number; timeoutMs: number } {
  return { graceMs: input.graceMs, timeoutMs: input.timeout };
}

export function resolveRetryConfig(input: { capMs: number; initial: number }): { capMs: number; initialMs: number } {
  return { capMs: input.capMs, initialMs: input.initial };
}

export function deadlineFromConfig(input: { skewMs: number; startMs: number; timeout: number }): number {
  return input.startMs + input.timeout + input.skewMs;
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
