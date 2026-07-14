const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const CACHE_POLICY = {
  client: {
    youtubeVideos: {
      freshTtlMs: 5 * MINUTE_MS,
      staleTtlMs: 30 * MINUTE_MS,
    },
    xPosts: {
      freshTtlMs: 30 * MINUTE_MS,
      staleTtlMs: 2 * HOUR_MS,
      version: "v3",
    },
  },
  worker: {
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
        freshTtlMs: 24 * HOUR_MS,
        staleTtlMs: 7 * DAY_MS,
      },
      channelVideos: {
        freshTtlMs: 5 * MINUTE_MS,
        staleTtlMs: 6 * HOUR_MS,
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
        version: "v3",
      },
      linkedPostLookup: {
        freshTtlMs: 7 * DAY_MS,
      },
    },
    naverCafe: {
      posts: {
        freshTtlMs: 10 * MINUTE_MS,
        staleTtlMs: 6 * HOUR_MS,
        version: "v1",
      },
    },
  },
} as const;
