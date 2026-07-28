import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import { clearActiveXHandlesCacheForTests } from "../infrastructure/d1-active-handles";

const fetchXPostsForHandlesMock = vi.hoisted(() => vi.fn());

vi.mock("../infrastructure/x-api", () => ({
  fetchXPostsForHandles: fetchXPostsForHandlesMock,
  XApiError: class XApiError extends Error {},
}));

import {
  buildXPostsApplication,
  createXPostsHandler,
} from "../index";

const handleXPosts = createXPostsHandler(buildXPostsApplication);

const makeEnv = ({
  allowlistFailure = false,
  allowedHandle = "otw_member",
}: {
  allowlistFailure?: boolean;
  allowedHandle?: string;
} = {}): Env =>
  ({
    X_BEARER_TOKEN: "token",
    YOUTUBE_API_KEY: "",
    otw_db: {
      prepare: (sql: string) => ({
        bind: () => ({
          first: async () =>
            sql.includes("FROM settings") ? { value: "public" } : null,
          all: async () => {
            if (allowlistFailure) throw new Error("D1 unavailable");
            return {
              results: [
                { url_twitter: `https://x.com/${allowedHandle}` },
              ],
            };
          },
        }),
      }),
    } as unknown as D1Database,
  }) as Env;

describe("X posts HTTP target policy", () => {
  beforeEach(() => {
    clearActiveXHandlesCacheForTests();
    fetchXPostsForHandlesMock.mockReset();
    fetchXPostsForHandlesMock.mockResolvedValue({
      posts: [],
      byHandle: [],
    });
  });

  it("case-insensitive duplicates are authorized once without refresh", async () => {
    const response = await handleXPosts(
      new Request(
        "https://example.com/api/x/posts?handles=OTW_MEMBER,otw_member&maxResults=5",
      ),
      makeEnv(),
    );

    expect(response.status).toBe(200);
    expect(fetchXPostsForHandlesMock).toHaveBeenCalledWith(
      ["OTW_MEMBER"],
      expect.objectContaining({
        maxResults: 5,
        refresh: false,
      }),
    );
  });

  it("rejects unapproved and oversized handle targets", async () => {
    const unapproved = await handleXPosts(
      new Request("https://example.com/api/x/posts?handles=other_member"),
      makeEnv(),
    );
    const oversized = await handleXPosts(
      new Request(
        `https://example.com/api/x/posts?handles=${Array.from(
          { length: 21 },
          (_, index) => `member_${index}`,
        ).join(",")}`,
      ),
      makeEnv(),
    );

    expect(unapproved.status).toBe(400);
    expect(oversized.status).toBe(400);
    expect(fetchXPostsForHandlesMock).not.toHaveBeenCalled();
  });

  it("returns 503 when the active-member allowlist is unavailable", async () => {
    const response = await handleXPosts(
      new Request("https://example.com/api/x/posts?handles=otw_member"),
      makeEnv({ allowlistFailure: true }),
    );

    expect(response.status).toBe(503);
    expect(fetchXPostsForHandlesMock).not.toHaveBeenCalled();
  });
});
