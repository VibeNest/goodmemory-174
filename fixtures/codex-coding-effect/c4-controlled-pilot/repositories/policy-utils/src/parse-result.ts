export type ParseResult<T> =
  | { ok: true; value: T }
  | { error: string; ok: false };

export function acceptUnchecked<T>(value: T): ParseResult<T> {
  return { ok: true, value };
}
