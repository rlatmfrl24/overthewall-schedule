const key = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, "");
export const aiExactTitleKey = key;
const scripts = (value: string) => [
  /\p{Script=Hangul}/u, /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u, /\p{Script=Latin}/u,
].map((pattern, index) => pattern.test(value) ? index : -1).filter((index) => index !== -1);

/** Arrange evidenced names; never translate or invent a Korean title. */
export function formatAiSongTitle(title: string, alternateTitles: string[]): string {
  const variants = [title, ...alternateTitles].flatMap(value => {
    const normalized = value.normalize("NFKC").trim();
    const pair = /^(.+?)\s*\(([^()]+)\)$/u.exec(normalized);
    if (!pair) return [normalized];
    const [, main, other] = pair;
    if (/\b(live|remix|acoustic|version|ver|edit|feat|cover|instrumental)\b|버전|라이브|커버|편곡|ライブ|リミックス|カバー/iu.test(other)) return [normalized];
    const mainScripts = scripts(main);
    if (!mainScripts.length || !scripts(other).some(script => !mainScripts.includes(script))) return [normalized];
    return [main.trim(), ...other.split(/[,、]/u).map(part => part.trim())];
  });
  const plain = variants.filter(value => !/[()]/u.test(value));
  const korean = plain.find(value => /\p{Script=Hangul}/u.test(value) && !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(value));
  const japanese = plain.find(value => !/\p{Script=Hangul}/u.test(value) && /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(value));
  const english = plain.find(value => !/\p{Script=Hangul}/u.test(value) && /\p{Script=Latin}/u.test(value));
  const original = japanese ?? english;
  // Version qualifiers are part of the supplied title, not alternate names.
  if (/[()]/u.test(title) && variants.includes(title.normalize("NFKC").trim())) return title.trim();
  return korean && original ? `${korean} (${original})` : title.trim();
}

/** Spelling variants, not substring/fuzzy matching or inferred translations. */
export function aiSongTitleKeys(title: string, artistNames: string[] = []): Set<string> {
  const normalized = title.normalize("NFKC").trim();
  const variants = [normalized];
  // Strip an artist prefix only when it names one of this song's original artists.
  for (const artist of artistNames) {
    const prefix = artist.normalize("NFKC").trim();
    if (normalized.toLowerCase().startsWith(prefix.toLowerCase())) {
      const remainder = normalized.slice(prefix.length);
      if (/^\s+[-–—:]\s+/u.test(remainder)) variants.push(remainder.replace(/^\s+[-–—:]\s+/u, ""));
    }
  }
  for (const variant of [...variants]) {
    const match = /^(.+?)\s*\(([^()]+)\)$/u.exec(variant);
    if (!match) continue;
    const [, main, alternate] = match;
    const mainScripts = scripts(main);
    const alternateScripts = scripts(alternate);
    // Preserve version qualifiers such as (Live)/(Acoustic)/(Remix).
    if (/\b(live|remix|acoustic|version|ver|edit|feat|cover|instrumental)\b|버전|라이브|커버|편곡|ライブ|リミックス|カバー/iu.test(alternate)) continue;
    if (mainScripts.length && alternateScripts.some((script) => !mainScripts.includes(script))) {
      variants.push(main, alternate);
      variants.push(...alternate.split(/[,、]/u).map((part) => part.trim()));
    }
  }
  return new Set(variants.map(key).filter(Boolean));
}

export const aiSongTitlesMatch = (left: Set<string>, right: Set<string>) =>
  [...left].some((value) => right.has(value));

/** Explicit video timecodes avoid ambiguous model integers such as 234 for 02:34. */
export function aiVideoTimecodeSeconds(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{1,3}:[0-5]\d(?::[0-5]\d)?$/u.test(value.trim())) return null;
  return value.trim().split(":").reduce((seconds, part) => seconds * 60 + Number(part), 0);
}
