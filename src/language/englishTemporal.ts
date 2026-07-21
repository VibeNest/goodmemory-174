const MONTHS: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

const SEASONS: Record<string, number> = {
  spring: 2,
  summer: 5,
  fall: 8,
  autumn: 8,
  winter: 11,
};

const MONTH_PATTERN = Object.keys(MONTHS).join("|");
const SEASON_PATTERN = Object.keys(SEASONS).join("|");

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

function recentMonthStart(
  reference: Date,
  month: number,
  strictlyBefore: boolean,
): string | undefined {
  let year = reference.getUTCFullYear();
  const currentMonth = reference.getUTCMonth();
  if (strictlyBefore ? month >= currentMonth : month > currentMonth) {
    year -= 1;
  }
  return utcInstant(year, month);
}

function monthIndex(value: string): number | undefined {
  return MONTHS[value.toLowerCase()];
}

export function resolveEnglishTemporalReference(
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

  const monthDayYear = text.match(new RegExp(
    `\\b(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`,
    "iu",
  ));
  if (monthDayYear) {
    const month = monthIndex(monthDayYear[1]!);
    if (month !== undefined) {
      const instant = utcInstant(
        Number(monthDayYear[3]),
        month,
        Number(monthDayYear[2]),
      );
      if (instant) return instant;
    }
  }

  const dayMonthYear = text.match(new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_PATTERN})\\.?,?\\s+(\\d{4})\\b`,
    "iu",
  ));
  if (dayMonthYear) {
    const month = monthIndex(dayMonthYear[2]!);
    if (month !== undefined) {
      const instant = utcInstant(
        Number(dayMonthYear[3]),
        month,
        Number(dayMonthYear[1]),
      );
      if (instant) return instant;
    }
  }

  const monthYear = text.match(new RegExp(
    `\\b(${MONTH_PATTERN})\\.?,?\\s+(\\d{4})\\b`,
    "iu",
  ));
  if (monthYear) {
    const month = monthIndex(monthYear[1]!);
    if (month !== undefined) {
      const instant = utcInstant(Number(monthYear[2]), month);
      if (instant) return instant;
    }
  }

  const quarter = text.match(/\bQ([1-4])\s*(\d{4})\b/iu);
  if (quarter) {
    return utcInstant(Number(quarter[2]), (Number(quarter[1]) - 1) * 3);
  }

  const seasonYear = text.match(new RegExp(
    `\\b(${SEASON_PATTERN})\\s+(\\d{4})\\b`,
    "iu",
  ));
  if (seasonYear) {
    return utcInstant(
      Number(seasonYear[2]),
      SEASONS[seasonYear[1]!.toLowerCase()]!,
    );
  }

  const referenceMs = Date.parse(referenceTime);
  if (!Number.isFinite(referenceMs)) {
    return undefined;
  }
  const reference = new Date(referenceMs);
  const unitsAgo = text.match(
    /\b(\d{1,3})\s+(day|week|month|year)s?\s+ago\b/iu,
  );
  if (unitsAgo) {
    const count = Number(unitsAgo[1]);
    const unit = unitsAgo[2]!.toLowerCase();
    if (unit === "day" || unit === "week") {
      return utcDayStart(
        referenceMs - count * (unit === "week" ? 7 : 1) * 86_400_000,
      );
    }
    if (unit === "month") {
      return shiftedMonthStart(reference, -count);
    }
    return utcInstant(reference.getUTCFullYear() - count, 0);
  }
  const relativeDay = text.match(/\b(yesterday|today|tomorrow)\b/iu)?.[1]
    ?.toLowerCase();
  if (relativeDay) {
    const offset = relativeDay === "yesterday"
      ? -1
      : relativeDay === "tomorrow"
      ? 1
      : 0;
    return utcDayStart(referenceMs + offset * 86_400_000);
  }

  const relativePeriod = text.match(
    /\b(last|this|next)\s+(week|month|quarter|year)\b/iu,
  );
  if (relativePeriod) {
    const direction = relativePeriod[1]!.toLowerCase();
    const offset = direction === "last" ? -1 : direction === "next" ? 1 : 0;
    const unit = relativePeriod[2]!.toLowerCase();
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

  const lastSeason = text.match(new RegExp(
    `\\blast\\s+(${SEASON_PATTERN})\\b`,
    "iu",
  ));
  if (lastSeason) {
    return recentMonthStart(
      reference,
      SEASONS[lastSeason[1]!.toLowerCase()]!,
      true,
    );
  }
  const lastMonth = text.match(new RegExp(
    `\\blast\\s+(${MONTH_PATTERN})\\b`,
    "iu",
  ));
  if (lastMonth) {
    const month = monthIndex(lastMonth[1]!);
    if (month !== undefined) return recentMonthStart(reference, month, true);
  }

  const bareMonth = text.match(new RegExp(`\\b(${MONTH_PATTERN})\\b`, "iu"));
  if (bareMonth) {
    const token = bareMonth[1]!;
    const month = monthIndex(token);
    if (month !== undefined && (token.toLowerCase() !== "may" || token === "May")) {
      return recentMonthStart(reference, month, false);
    }
  }

  const year = text.match(/(?:^|[^\d])(\d{4})(?:$|[^\d-])/u);
  return year ? utcInstant(Number(year[1]), 0) : undefined;
}
