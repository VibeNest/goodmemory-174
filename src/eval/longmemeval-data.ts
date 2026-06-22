// Static fixture data for the LongMemEval harness: the number-word value map and
// the regex patterns used to detect numeric/number-word tokens when scoring
// numeric answers. Extracted from longmemeval.ts so the harness file stays
// focused on execution/scoring logic rather than inlined lookup tables. This is
// a leaf module — it imports nothing back from the harness.

export const NUMBER_WORD_VALUES = {
  eight: 8,
  eighteen: 18,
  eighty: 80,
  eleven: 11,
  fifteen: 15,
  fifty: 50,
  five: 5,
  forty: 40,
  four: 4,
  fourteen: 14,
  nine: 9,
  nineteen: 19,
  ninety: 90,
  one: 1,
  seven: 7,
  seventeen: 17,
  seventy: 70,
  six: 6,
  sixteen: 16,
  sixty: 60,
  ten: 10,
  thirteen: 13,
  thirty: 30,
  three: 3,
  twelve: 12,
  twenty: 20,
  two: 2,
  zero: 0,
} as const;

// Module-local: only used to build NUMBER_TOKEN_PATTERN below.
const NUMBER_WORD_PATTERN =
  "ninety(?:[-\\s]+(?:one|two|three|four|five|six|seven|eight|nine))?|eighty(?:[-\\s]+(?:one|two|three|four|five|six|seven|eight|nine))?|seventy(?:[-\\s]+(?:one|two|three|four|five|six|seven|eight|nine))?|sixty(?:[-\\s]+(?:one|two|three|four|five|six|seven|eight|nine))?|fifty(?:[-\\s]+(?:one|two|three|four|five|six|seven|eight|nine))?|forty(?:[-\\s]+(?:one|two|three|four|five|six|seven|eight|nine))?|thirty(?:[-\\s]+(?:one|two|three|four|five|six|seven|eight|nine))?|twenty(?:[-\\s]+(?:one|two|three|four|five|six|seven|eight|nine))?|nineteen|eighteen|seventeen|sixteen|fifteen|fourteen|thirteen|twelve|eleven|ten|nine|eight|seven|six|five|four|three|two|one|zero";

export const NUMBER_TOKEN_PATTERN = new RegExp(
  `\\b(?:\\d+(?:\\.\\d+)?|${NUMBER_WORD_PATTERN})\\b`,
  "giu",
);
