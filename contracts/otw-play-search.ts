const WHITESPACE_PATTERN = /\s+/gu;
const PUNCTUATION_PATTERN = /\p{P}+/gu;

export const normalizeOtwPlaySearchText = (value: string): string =>
  value
    .normalize("NFKC")
    .trim()
    .replace(WHITESPACE_PATTERN, " ")
    .toLowerCase()
    .replace(PUNCTUATION_PATTERN, " ")
    .replace(WHITESPACE_PATTERN, " ")
    .trim();
