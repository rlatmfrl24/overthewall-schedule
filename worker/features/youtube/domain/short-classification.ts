const EXTENDED_SHORTS_START_AT = Date.parse("2024-10-15T00:00:00.000Z");
const SHORTS_TOKEN = /(^|[^\p{L}\p{N}_])#shorts(?=$|[^\p{L}\p{N}_])/iu;

export type YouTubeShortClassificationInput = {
  durationSeconds: number;
  publishedAt: number;
  title?: string | null;
  description?: string | null;
};
export const isYouTubeShort = ({
  durationSeconds,
  publishedAt,
  title,
  description,
}: YouTubeShortClassificationInput) => {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return false;
  if (durationSeconds <= 60) return true;
  if (durationSeconds > 180 || publishedAt < EXTENDED_SHORTS_START_AT) {
    return false;
  }
  return SHORTS_TOKEN.test(`${title ?? ""}\n${description ?? ""}`);
};
