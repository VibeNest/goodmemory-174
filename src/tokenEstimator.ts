const CONSERVATIVE_SCRIPT_CHARACTER =
  /[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}]/u;

function isConservativeScriptCharacter(character: string): boolean {
  return CONSERVATIVE_SCRIPT_CHARACTER.test(character);
}

export function estimateTextTokens(value: string): number {
  let conservativeScriptCharacters = 0;
  let otherCodeUnits = 0;

  for (const character of value) {
    if (isConservativeScriptCharacter(character)) {
      conservativeScriptCharacters += 1;
    } else {
      otherCodeUnits += character.length;
    }
  }

  return conservativeScriptCharacters + Math.ceil(otherCodeUnits / 4);
}

export function truncateTextToEstimatedTokens(
  value: string,
  maxTokens: number,
): string {
  if (maxTokens <= 0 || value.length === 0) {
    return "";
  }

  let conservativeScriptCharacters = 0;
  let end = 0;
  let otherCodeUnits = 0;

  for (const character of value) {
    const isConservative = isConservativeScriptCharacter(character);
    const nextConservativeScriptCharacters =
      conservativeScriptCharacters +
      (isConservative ? 1 : 0);
    const nextOtherCodeUnits =
      otherCodeUnits +
      (isConservative ? 0 : character.length);
    const nextEstimate =
      nextConservativeScriptCharacters + Math.ceil(nextOtherCodeUnits / 4);

    if (nextEstimate > maxTokens) {
      break;
    }

    conservativeScriptCharacters = nextConservativeScriptCharacters;
    end += character.length;
    otherCodeUnits = nextOtherCodeUnits;
  }

  return value.slice(0, end);
}
