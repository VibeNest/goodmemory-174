function utcInstant(year: number, month: number, day = 1): string | undefined {
  const date = new Date(Date.UTC(year, month, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return date.toISOString();
}

function utcDayStart(instantMs: number): string {
  const date = new Date(instantMs);
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  )).toISOString();
}

function shiftedMonthStart(reference: Date, offset: number): string {
  return new Date(Date.UTC(
    reference.getUTCFullYear(),
    reference.getUTCMonth() + offset,
    1,
  )).toISOString();
}

function shiftedQuarterStart(reference: Date, offset: number): string {
  const quarterMonth = Math.floor(reference.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(
    reference.getUTCFullYear(),
    quarterMonth + offset * 3,
    1,
  )).toISOString();
}

export function resolveCjkTemporalReference(
  text: string,
  referenceTime: string,
): string | undefined {
  const isoDate = text.match(
    /(?:^|[^\d])(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:$|[^\d])/u,
  );
  if (isoDate) {
    return utcInstant(
      Number(isoDate[1]),
      Number(isoDate[2]) - 1,
      Number(isoDate[3]),
    );
  }

  const cjkDate = text.match(
    /(\d{4})\s*年\s*(\d{1,2})\s*月(?:\s*(\d{1,2})\s*[日号號])?/u,
  );
  if (cjkDate) {
    const instant = utcInstant(
      Number(cjkDate[1]),
      Number(cjkDate[2]) - 1,
      cjkDate[3] ? Number(cjkDate[3]) : 1,
    );
    if (instant) {
      return instant;
    }
  }

  const year = text.match(/(?:^|[^\d])(\d{4})(?:\s*年)(?:$|[^\d])/u);
  if (year) {
    return utcInstant(Number(year[1]), 0);
  }

  const referenceMs = Date.parse(referenceTime);
  if (!Number.isFinite(referenceMs)) {
    return undefined;
  }
  const reference = new Date(referenceMs);
  const daysAgo = text.match(/(\d{1,3})\s*日前/u);
  if (daysAgo) {
    return utcDayStart(referenceMs - Number(daysAgo[1]) * 86_400_000);
  }
  const relativeDays = [
    [/(?:前天|一昨日)/u, -2],
    [/(?:昨天|昨日)/u, -1],
    [/(?:今天|今日)/u, 0],
    [/(?:后天|後天|明後日)/u, 2],
    [/(?:明天|明日)/u, 1],
  ] as const;
  for (const [pattern, offset] of relativeDays) {
    if (pattern.test(text)) {
      return utcDayStart(referenceMs + offset * 86_400_000);
    }
  }

  const relativePeriods = [
    [/(?:上周|上週|先週)/u, "week", -1],
    [/(?:本周|本週|这周|這週|今週)/u, "week", 0],
    [/(?:下周|下週|来週)/u, "week", 1],
    [/(?:上个月|上個月|上月|先月)/u, "month", -1],
    [/(?:本个月|本個月|这(?:个|個)月|這(?:个|個)月|今月)/u, "month", 0],
    [/(?:下个月|下個月|下月|来月)/u, "month", 1],
    [/(?:上季度)/u, "quarter", -1],
    [/(?:本季度|这季度|這季度)/u, "quarter", 0],
    [/(?:下季度)/u, "quarter", 1],
    [/(?:去年|昨年|上年)/u, "year", -1],
    [/(?:今年|本年|这年|這年)/u, "year", 0],
    [/(?:明年|来年|下年)/u, "year", 1],
  ] as const;
  for (const [pattern, unit, offset] of relativePeriods) {
    if (!pattern.test(text)) {
      continue;
    }
    if (unit === "week") {
      return utcDayStart(referenceMs + offset * 7 * 86_400_000);
    }
    if (unit === "month") {
      return shiftedMonthStart(reference, offset);
    }
    if (unit === "quarter") {
      return shiftedQuarterStart(reference, offset);
    }
    return utcInstant(reference.getUTCFullYear() + offset, 0);
  }
  return undefined;
}
