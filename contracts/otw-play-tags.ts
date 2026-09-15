/** Shared suggestions for the composition's genre/scene, not video topics. */
export const OTW_PLAY_RECOMMENDED_SONG_TAGS = ["K-POP", "J-POP", "보컬로이드"] as const;

const tagKey = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/[\s_-]+/gu, "");
const canonicalTags = new Map([
  ...OTW_PLAY_RECOMMENDED_SONG_TAGS.map((tag) => [tagKey(tag), tag] as const),
  ["vocaloid", "보컬로이드"],
  ["ボーカロイド", "보컬로이드"],
]);

export const normalizeOtwPlaySongTags = (tags: readonly string[]) => {
  const seen = new Set<string>();
  return tags.flatMap((raw) => {
    const tag = canonicalTags.get(tagKey(raw)) ?? raw.normalize("NFKC").trim();
    const key = tagKey(tag);
    if (!key || tag.length > 40 || seen.has(key) || seen.size >= 10) return [];
    seen.add(key);
    return [tag];
  });
};
