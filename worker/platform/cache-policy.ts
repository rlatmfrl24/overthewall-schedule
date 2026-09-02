const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const WORKER_CACHE_POLICY = {
  chzzk: {
    vods: {
      freshTtlMs: 5 * MINUTE_MS,
      staleTtlMs: 6 * HOUR_MS,
      version: "v1",
    },
    clips: {
      freshTtlMs: 5 * MINUTE_MS,
      staleTtlMs: 6 * HOUR_MS,
      version: "v1",
    },
  },
  youtube: {
    uploadsPlaylist: {
      freshTtlMs: 30 * DAY_MS,
      staleTtlMs: 180 * DAY_MS,
    },
    officialChannelVideos: {
      freshTtlMs: 12 * HOUR_MS,
      staleTtlMs: 7 * DAY_MS,
      canonicalMaxResults: 20,
    },
    kirinukiChannelVideos: {
      freshTtlMs: 6 * HOUR_MS,
      staleTtlMs: 7 * DAY_MS,
      canonicalMaxResults: 40,
    },
  },
  x: {
    userLookup: {
      freshTtlMs: 30 * DAY_MS,
      notFoundTtlMs: 24 * HOUR_MS,
      staleTtlMs: 90 * DAY_MS,
    },
    posts: {
      freshTtlMs: 60 * MINUTE_MS,
      staleTtlMs: 24 * HOUR_MS,
      version: "v4",
    },
    linkedPostLookup: {
      freshTtlMs: 30 * DAY_MS,
    },
  },
  naverCafe: {
    posts: {
      freshTtlMs: 10 * MINUTE_MS,
      staleTtlMs: 6 * HOUR_MS,
      version: "v1",
    },
  },
} as const;
