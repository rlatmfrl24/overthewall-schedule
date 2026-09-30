import { describe, expect, it } from "vitest";
import type { Env } from "../../../platform/types";
import {
  isYouTubeShortsPageComplete,
  readStoredYouTubeFeed,
} from "./youtube-feed";

const initialized = 1_700_000_000_000;

describe("YouTube Shorts frontier completeness", () => {
  it("keeps a global page refreshing while any source frontier can contain a newer item", () => {
    const candidates = Array.from({ length: 20 }, (_, index) => 200 - index);
    expect(
      isYouTubeShortsPageComplete(
        [
          {
            initialization_completed_at: initialized,
            backfill_frontier_published_at: 180,
            backfill_exhausted_at: null,
          },
          {
            initialization_completed_at: initialized,
            backfill_frontier_published_at: 185,
            backfill_exhausted_at: null,
          },
        ],
        candidates,
        20,
      ),
    ).toBe(false);
  });

  it("finalizes a full page after every active frontier passes its boundary", () => {
    const candidates = Array.from({ length: 20 }, (_, index) => 200 - index);
    expect(
      isYouTubeShortsPageComplete(
        [
          {
            initialization_completed_at: initialized,
            backfill_frontier_published_at: 175,
            backfill_exhausted_at: null,
          },
          {
            initialization_completed_at: initialized,
            backfill_frontier_published_at: null,
            backfill_exhausted_at: initialized,
          },
        ],
        candidates,
        20,
      ),
    ).toBe(true);
  });

  it("only finalizes a short last page when all sources are exhausted", () => {
    const candidates = [200, 190];
    expect(
      isYouTubeShortsPageComplete(
        [
          {
            initialization_completed_at: initialized,
            backfill_frontier_published_at: 100,
            backfill_exhausted_at: null,
          },
        ],
        candidates,
        20,
      ),
    ).toBe(false);
    expect(
      isYouTubeShortsPageComplete(
        [
          {
            initialization_completed_at: initialized,
            backfill_frontier_published_at: 100,
            backfill_exhausted_at: initialized,
          },
        ],
        candidates,
        20,
      ),
    ).toBe(true);
  });
});

describe("YouTube Shorts storage", () => {
  it("queries normal videos and Shorts independently before applying limits", async () => {
    const prepared: string[] = [];
    const channelId = `UC${"A".repeat(22)}`;
    const makeRows = (short: boolean) =>
      Array.from({ length: 20 }, (_, index) => ({
        video_id: `${short ? "s" : "v"}-${index}`,
        title: "title",
        thumbnail_url: "",
        channel_title: "Member",
        duration_seconds: short ? 30 : 600,
        view_count: 1,
        is_short: short ? 1 : 0,
        published_at: initialized - index,
        fetched_at: initialized,
        youtube_channel_id: channelId,
      }));
    const db = {
      prepare(sql: string) {
        prepared.push(sql);
        let bindings: unknown[] = [];
        const statement = {
          bind(...values: unknown[]) {
            bindings = values;
            return statement;
          },
          async first<T>() {
            return { value: "true" } as T;
          },
          async all<T>() {
            return { results: makeRows(Number(bindings[1]) === 1) as T[] };
          },
        };
        return statement;
      },
    } as unknown as D1Database;

    const result = await readStoredYouTubeFeed(
      { otw_db: db } as Env,
      [channelId],
      20,
      "official",
    );

    expect(result?.videos).toHaveLength(20);
    expect(result?.shorts).toHaveLength(20);
    expect(
      prepared.filter((sql) => sql.includes("FROM youtube_feed_videos")),
    ).toHaveLength(2);
  });
});
