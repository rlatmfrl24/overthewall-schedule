import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchChzzkVideosBatchMock = vi.hoisted(() => vi.fn());
const fetchChzzkClipsBatchMock = vi.hoisted(() => vi.fn());

vi.mock("../infrastructure/chzzk-api", () => ({
  fetchChzzkVideosBatch: fetchChzzkVideosBatchMock,
  fetchChzzkClipsBatch: fetchChzzkClipsBatchMock,
  isChzzkVideoD1CacheProfile: (page: number, size: number) =>
    (page === 0 && (size === 1 || size === 10)) ||
    (page >= 0 && page <= 2 && size === 5),
  isChzzkClipD1CacheProfile: (size: number) => size === 10,
}));

import {
  buildChzzkApplication,
  clearChzzkRouteCachesForTests,
  createChzzkMediaHandler,
} from "../index";
import type { Env } from "../../../platform/types";

const registeredChannelId = "a".repeat(32);
const unknownChannelId = "b".repeat(32);
const handleVods = createChzzkMediaHandler((env) =>
  buildChzzkApplication(env, {
    autoFillLiveSchedules: async () => ({ updated: 0, details: [] }),
    writeAutoFillAudit: async () => undefined,
  }),
);

const makeEnv = () => {
  const prepare = vi.fn(() => ({
    all: async () => ({
      results: [
        { url_chzzk: `https://chzzk.naver.com/${registeredChannelId}` },
      ],
    }),
  }));
  return {
    env: {
      YOUTUBE_API_KEY: "youtube-key",
      otw_db: { prepare } as unknown as D1Database,
    } as Env,
    prepare,
  };
};

const makeUnavailableEnv = (): Env =>
  ({
    YOUTUBE_API_KEY: "youtube-key",
    otw_db: {
      prepare: () => ({
        all: async () => {
          throw new Error("D1 unavailable");
        },
      }),
    } as unknown as D1Database,
  }) as Env;

describe("CHZZK media routes", () => {
  beforeEach(() => {
    clearChzzkRouteCachesForTests();
    fetchChzzkVideosBatchMock.mockReset();
    fetchChzzkClipsBatchMock.mockReset();
    fetchChzzkVideosBatchMock.mockImplementation(async (requests) =>
      requests.map((request: { channelId: string }) => ({
        channelId: request.channelId,
        content: { data: [] },
      })),
    );
    fetchChzzkClipsBatchMock.mockImplementation(async (requests) =>
      requests.map((request: { channelId: string }) => ({
        channelId: request.channelId,
        content: { data: [] },
      })),
    );
  });

  it("활성 멤버 채널을 정규화·중복 제거하고 승인된 캐시 대상으로 표시한다", async () => {
    const { env } = makeEnv();
    const response = await handleVods(
      new Request(
        `https://example.com/api/vods/chzzk?channelIds=${registeredChannelId.toUpperCase()},${registeredChannelId}&page=0&size=10`,
      ),
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      items: [
        { channelId: registeredChannelId },
      ],
    });
    expect(fetchChzzkVideosBatchMock).toHaveBeenCalledWith(
      [
        {
          channelId: registeredChannelId,
          page: 0,
          size: 10,
          cacheable: true,
        },
      ],
      env.otw_db,
    );
  });

  it("승인되지 않은 VOD 프로필은 등록 채널이어도 D1에 저장하지 않는다", async () => {
    const { env, prepare } = makeEnv();
    const response = await handleVods(
      new Request(
        `https://example.com/api/vods/chzzk?channelIds=${registeredChannelId}&page=0&size=11`,
      ),
      env,
    );

    expect(response.status).toBe(200);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(fetchChzzkVideosBatchMock).toHaveBeenCalledWith(
      [
        {
          channelId: registeredChannelId,
          page: 0,
          size: 11,
          cacheable: false,
        },
      ],
      env.otw_db,
    );
  });

  it("클립 size=10은 승인된 등록 채널에 D1 캐시를 허용한다", async () => {
    const { env } = makeEnv();
    const response = await handleVods(
      new Request(
        `https://example.com/api/clips/chzzk?channelIds=${registeredChannelId}&size=10`,
      ),
      env,
    );

    expect(response.status).toBe(200);
    expect(fetchChzzkClipsBatchMock).toHaveBeenCalledWith(
      [
        { channelId: registeredChannelId, size: 10, cacheable: true },
      ],
      env.otw_db,
    );
  });

  it.each([
    ["invalid channel", "/api/vods/chzzk?channelIds=invalid", 400],
    [
      "unapproved channel",
      `/api/vods/chzzk?channelIds=${unknownChannelId}`,
      400,
    ],
    [
      "too many channels",
      `/api/vods/chzzk?channelIds=${Array.from({ length: 21 }, (_, index) => index.toString(16).padStart(32, "0")).join(",")}`,
      400,
    ],
    [
      "invalid page",
      `/api/vods/chzzk?channelId=${registeredChannelId}&page=101`,
      400,
    ],
    [
      "invalid vod size",
      `/api/vods/chzzk?channelId=${registeredChannelId}&size=0`,
      400,
    ],
    [
      "invalid clip size",
      `/api/clips/chzzk?channelId=${registeredChannelId}&size=51`,
      400,
    ],
  ])("%s 요청은 명시적인 400을 반환한다", async (_name, path, status) => {
    const { env } = makeEnv();
    const response = await handleVods(
      new Request(`https://example.com${path}`),
      env,
    );

    expect(response.status).toBe(status);
    expect(fetchChzzkVideosBatchMock).not.toHaveBeenCalled();
    expect(fetchChzzkClipsBatchMock).not.toHaveBeenCalled();
  });

  it("활성 채널 allowlist 조회 실패는 외부 호출 없이 503을 반환한다", async () => {
    const response = await handleVods(
      new Request(
        `https://example.com/api/vods/chzzk?channelIds=${registeredChannelId}`,
      ),
      makeUnavailableEnv(),
    );

    expect(response.status).toBe(503);
    expect(fetchChzzkVideosBatchMock).not.toHaveBeenCalled();
  });
});
