const CURSOR_VERSION = 1;

export type YouTubeShortsCursor = {
  publishedAt: number;
  videoId: string;
};

type SerializedCursor = {
  v: typeof CURSOR_VERSION;
  p: number;
  i: string;
  c: string;
};

const fingerprintChannels = (channelIds: readonly string[]) => {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode([...channelIds].sort().join(","))) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

const toBase64Url = (value: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(value)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");

const fromBase64Url = (value: string) => {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return new TextDecoder().decode(
    Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)),
  );
};

export class YouTubeShortsCursorError extends Error {
  constructor() {
    super("Invalid YouTube Shorts cursor");
    this.name = "YouTubeShortsCursorError";
  }
}

export const encodeYouTubeShortsCursor = (
  cursor: YouTubeShortsCursor,
  channelIds: readonly string[],
) => toBase64Url(JSON.stringify({
  v: CURSOR_VERSION,
  p: cursor.publishedAt,
  i: cursor.videoId,
  c: fingerprintChannels(channelIds),
} satisfies SerializedCursor));

export const decodeYouTubeShortsCursor = (
  value: string | null,
  channelIds: readonly string[],
): YouTubeShortsCursor | null => {
  if (!value) return null;
  if (value.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new YouTubeShortsCursorError();
  }
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(value));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as Partial<SerializedCursor>).v !== CURSOR_VERSION ||
      !Number.isSafeInteger((parsed as Partial<SerializedCursor>).p) ||
      Number((parsed as Partial<SerializedCursor>).p) <= 0 ||
      typeof (parsed as Partial<SerializedCursor>).i !== "string" ||
      !(parsed as Partial<SerializedCursor>).i ||
      (parsed as Partial<SerializedCursor>).c !== fingerprintChannels(channelIds)
    ) {
      throw new YouTubeShortsCursorError();
    }
    return {
      publishedAt: Number((parsed as SerializedCursor).p),
      videoId: (parsed as SerializedCursor).i,
    };
  } catch (error) {
    if (error instanceof YouTubeShortsCursorError) throw error;
    throw new YouTubeShortsCursorError();
  }
};
