import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../worker/types";

const getDbMock = vi.hoisted(() => vi.fn());

vi.mock("../../../worker/db", () => ({
  getDb: getDbMock,
}));

import { handleMembers } from "../../../worker/routes/members";

const makeEnv = (overrides: Partial<Env> = {}): Env =>
  ({
    YOUTUBE_API_KEY: "",
    X_BEARER_TOKEN: "token",
    otw_db: {} as D1Database,
    ...overrides,
  }) as Env;

const makeMember = (overrides: Record<string, unknown> = {}) => ({
  uid: 1,
  code: "member",
  name: "멤버",
  main_color: "#31a4a9",
  sub_color: "#f66479",
  oshi_mark: "⭐",
  url_twitter: "https://x.com/member",
  url_youtube: "https://www.youtube.com/@member",
  url_chzzk: "https://chzzk.naver.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  youtube_channel_id: "UC_MEMBER",
  birth_date: "2026-02-13",
  debut_date: "2026-03-14",
  unit_name: "OTW",
  fan_name: "팬덤",
  introduction: "소개",
  is_deprecated: 0,
  ...overrides,
});

const memberQuery = (rows: unknown[]) => ({
  from: () => ({
    where: () => ({
      limit: async () => rows,
    }),
  }),
});

const rowsQuery = (rows: unknown[]) => ({
  from: () => ({
    where: async () => rows,
  }),
});

const orderedRowsQuery = (rows: unknown[]) => ({
  from: () => ({
    where: () => ({
      orderBy: async () => rows,
    }),
  }),
});

const makeDb = (queries: unknown[]) => ({
  select: vi.fn(() => {
    const query = queries.shift();
    if (!query) {
      throw new Error("Unexpected select call");
    }
    return query;
  }),
});

describe("members route", () => {
  beforeEach(() => {
    getDbMock.mockReset();
  });

  it("멤버 상세는 이미지와 링크를 정렬된 프로필 계약으로 반환한다", async () => {
    const member = makeMember();
    const db = makeDb([
      memberQuery([member]),
      orderedRowsQuery([
        {
          id: 2,
          member_uid: 1,
          image_url: "/profile/member-2.webp",
          alt: "두 번째 이미지",
          sort_order: 1,
          created_at: null,
        },
        {
          id: 1,
          member_uid: 1,
          image_url: "/profile/member.webp",
          alt: "첫 번째 이미지",
          sort_order: 0,
          created_at: null,
        },
      ]),
      orderedRowsQuery([
        {
          id: 7,
          name: "멤버 게시판",
          cafe_id: "31352147",
          menu_id: "9",
          cafe_url: "https://cafe.naver.com/f-e/cafes/31352147/menus/9",
          member_uid: 1,
          enabled: true,
          sort_order: 0,
          created_at: null,
          updated_at: null,
        },
      ]),
      orderedRowsQuery([
        {
          id: 3,
          member_uid: 1,
          type: "youtube_vod",
          label: "다시보기",
          url: "https://www.youtube.com/@member-vod",
          youtube_channel_id: "UC_VOD",
          sort_order: 0,
          enabled: true,
          created_at: null,
          updated_at: null,
        },
        {
          id: 4,
          member_uid: 1,
          type: "twitcasting",
          label: "트윗캐스팅",
          url: "https://twitcasting.tv/member",
          youtube_channel_id: null,
          sort_order: 1,
          enabled: true,
          created_at: null,
          updated_at: null,
        },
      ]),
    ]);
    getDbMock.mockReturnValue(db);

    const response = await handleMembers(
      new Request("https://example.com/api/members/member"),
      makeEnv(),
    );
    const body = (await response.json()) as {
      profileImages: Array<{ imageUrl: string; sortOrder: number }>;
      links: Array<{ type: string; url: string; youtubeChannelId?: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.profileImages).toEqual([
      expect.objectContaining({ imageUrl: "/profile/member.webp", sortOrder: 0 }),
      expect.objectContaining({ imageUrl: "/profile/member-2.webp", sortOrder: 1 }),
    ]);
    expect(body.links.map((link) => link.type)).toEqual([
      "x",
      "naver_cafe",
      "youtube",
      "chzzk",
      "youtube_vod",
      "twitcasting",
    ]);
    expect(body.links.find((link) => link.type === "youtube")?.youtubeChannelId).toBe(
      "UC_MEMBER",
    );
    expect(body.links.find((link) => link.type === "youtube_vod")?.url).toBe(
      "https://www.youtube.com/@member-vod",
    );
    expect(body.links.find((link) => link.type === "twitcasting")?.url).toBe(
      "https://twitcasting.tv/member",
    );
  });

  it("이미지 행이 없으면 기존 public profile 경로를 fallback으로 반환한다", async () => {
    const member = makeMember({ code: "fallback_member", name: "폴백" });
    const db = makeDb([
      memberQuery([member]),
      orderedRowsQuery([]),
      orderedRowsQuery([]),
      orderedRowsQuery([]),
    ]);
    getDbMock.mockReturnValue(db);

    const response = await handleMembers(
      new Request("https://example.com/api/members/fallback_member"),
      makeEnv(),
    );
    const body = (await response.json()) as {
      profileImages: Array<{ id: number | null; imageUrl: string; alt: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.profileImages).toEqual([
      {
        id: null,
        memberUid: 1,
        imageUrl: "/profile/fallback_member.webp",
        alt: "폴백 프로필 이미지",
        sortOrder: 0,
      },
    ]);
  });

  it("R2에 등록된 멤버 배경 이미지를 정렬된 목록으로 반환한다", async () => {
    const member = makeMember({ code: "bing_hayu" });
    const db = makeDb([
      memberQuery([member]),
      orderedRowsQuery([]),
      orderedRowsQuery([]),
      orderedRowsQuery([]),
    ]);
    const list = vi.fn(async () => ({
      objects: [
        {
          key: "members/bing_hayu/backgrounds/stage-night/original.webp",
          etag: "stage-original-etag",
        },
        {
          key: "members/bing_hayu/backgrounds/default/original.webp",
          etag: "default-original-etag",
        },
        {
          key: "members/bing_hayu/backgrounds/default/w1280.webp",
          etag: "default-w1280-etag",
        },
        {
          key: "members/bing_hayu/backgrounds/incomplete/w1280.webp",
          etag: "incomplete-w1280-etag",
        },
      ],
    }));
    getDbMock.mockReturnValue(db);

    const response = await handleMembers(
      new Request("https://example.com/api/members/bing_hayu"),
      makeEnv({
        ASSET_BUCKET: {
          list,
        } as unknown as R2Bucket,
      }),
    );
    const body = (await response.json()) as {
      backgroundImages: Array<{
        id: string;
        sortOrder: number;
        version: string;
      }>;
    };

    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledWith({
      prefix: "members/bing_hayu/backgrounds/",
    });
    expect(body.backgroundImages).toEqual([
      {
        id: "default",
        sortOrder: 0,
        version: "original:default-original-etag|w1280:default-w1280-etag",
      },
      {
        id: "stage-night",
        sortOrder: 1,
        version: "original:stage-original-etag",
      },
    ]);
  });

  it("잘못 인코딩된 멤버 코드는 DB 조회 없이 404를 반환한다", async () => {
    const response = await handleMembers(
      new Request("https://example.com/api/members/%E0%A4%A"),
      makeEnv(),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Member not found");
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("path segment를 벗어나는 멤버 코드는 DB 조회 없이 404를 반환한다", async () => {
    const response = await handleMembers(
      new Request("https://example.com/api/members/bad%2Fcode"),
      makeEnv(),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Member not found");
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("없는 멤버는 404를 반환한다", async () => {
    const db = makeDb([memberQuery([]), rowsQuery([])]);
    getDbMock.mockReturnValue(db);

    const response = await handleMembers(
      new Request("https://example.com/api/members/missing"),
      makeEnv(),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Member not found");
  });
});
