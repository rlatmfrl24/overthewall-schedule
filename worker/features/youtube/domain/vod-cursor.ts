export class YouTubeVodInputError extends Error {}

export const encodeVodCursor = (publishedAt: number, videoId: string, filter: number[]) =>
  btoa(JSON.stringify({ v: 1, publishedAt, videoId, filter }));

export const decodeVodCursor = (value: string | null, filter: number[]) => {
  if (!value) return null;
  try {
    if (value.length > 2048) throw new Error();
    const parsed = JSON.parse(atob(value));
    if (parsed.v !== 1 || !Number.isSafeInteger(parsed.publishedAt) || parsed.publishedAt < 0 ||
      typeof parsed.videoId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(parsed.videoId) ||
      JSON.stringify(parsed.filter) !== JSON.stringify(filter)) throw new Error();
    return { publishedAt: parsed.publishedAt as number, videoId: parsed.videoId as string };
  } catch { throw new YouTubeVodInputError("Invalid VOD cursor"); }
};
