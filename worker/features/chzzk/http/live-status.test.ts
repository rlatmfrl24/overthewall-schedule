import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildChzzkApplication,
  createLiveScheduleAutoFillHandler,
  createLiveStatusHandler,
} from "../index";
import {
  clearActiveChzzkChannelsCacheForTests,
} from "../infrastructure/d1-active-channels";
import type { Env } from "../../../platform/types";

const fetchChzzkLiveStatusMock = vi.hoisted(() => vi.fn());
const fetchChzzkLiveStatusWithDebugMock = vi.hoisted(() => vi.fn());
const autoFillUndecidedLiveSchedulesMock = vi.hoisted(() => vi.fn());
const isLiveScheduleAutoFillEnabledMock = vi.hoisted(() => vi.fn());
const requireAdminUserMock = vi.hoisted(() => vi.fn());
const auditValuesMock = vi.hoisted(() =>
  vi.fn(async (value?: unknown) => {
    void value;
    return { success: true };
  }),
);
const fakeDb = vi.hoisted(() => ({
  insert: () => ({ values: auditValuesMock }),
}));

vi.mock(
  "../infrastructure/chzzk-api",
  () => ({
    fetchChzzkLiveStatus: fetchChzzkLiveStatusMock,
    fetchChzzkLiveStatusWithDebug: fetchChzzkLiveStatusWithDebugMock,
  }),
);

vi.mock("../../schedules/infrastructure/live-schedule", () => ({
  autoFillUndecidedLiveSchedules: autoFillUndecidedLiveSchedulesMock,
  isLiveScheduleAutoFillEnabled: isLiveScheduleAutoFillEnabledMock,
}));

vi.mock("../../../platform/auth", () => ({
  requireAdminUser: requireAdminUserMock,
}));

vi.mock("../../../platform/db", () => ({
  getDb: () => fakeDb,
}));

const channelId = "a".repeat(32);
const unapprovedChannelId = "b".repeat(32);
const cacheStore = new Map<string, Response>();

const makeEnv = (): Env =>
  ({
    YOUTUBE_API_KEY: "",
    X_BEARER_TOKEN: "",
    otw_db: {
      prepare: () => ({
        all: async () => ({
          results: [
            { url_chzzk: `https://chzzk.naver.com/${channelId}` },
          ],
        }),
      }),
    } as unknown as D1Database,
  }) as Env;

const buildTestChzzkApplication = (env: Env) =>
  buildChzzkApplication(env, {
    autoFillLiveSchedules: async (items) =>
      (await isLiveScheduleAutoFillEnabledMock(fakeDb))
        ? autoFillUndecidedLiveSchedulesMock(fakeDb, items)
        : { updated: 0, details: [] },
    writeAutoFillAudit: async (input) => {
      await auditValuesMock(input);
    },
  });

const handleLiveStatus = createLiveStatusHandler(
  buildTestChzzkApplication,
);
const handleLiveScheduleAutoFill = createLiveScheduleAutoFillHandler(
  buildTestChzzkApplication,
);

const liveContent = {
  status: "OPEN",
  liveTitle: "라이브 방송",
  concurrentUserCount: 10,
  liveImageUrl: "",
  defaultThumbnailImageUrl: "",
  openDate: "2026-06-30T20:15:00+09:00",
  channelId,
  channelName: "채널 A",
  channelImageUrl: "",
};

describe("live status route", () => {
  beforeEach(() => {
    cacheStore.clear();
    vi.stubGlobal("caches", {
      default: {
        match: async (request: Request) =>
          cacheStore.get(request.url)?.clone(),
        put: async (request: Request, response: Response) => {
          cacheStore.set(request.url, response.clone());
        },
      },
    });
    clearActiveChzzkChannelsCacheForTests();
    fetchChzzkLiveStatusMock.mockReset();
    fetchChzzkLiveStatusWithDebugMock.mockReset();
    autoFillUndecidedLiveSchedulesMock.mockReset();
    isLiveScheduleAutoFillEnabledMock.mockReset();
    requireAdminUserMock.mockReset();
    auditValuesMock.mockClear();
    fetchChzzkLiveStatusMock.mockResolvedValue(liveContent);
    requireAdminUserMock.mockResolvedValue({
      ok: true,
      user: { id: "admin", displayName: "Admin" },
    });
    isLiveScheduleAutoFillEnabledMock.mockResolvedValue(true);
    autoFillUndecidedLiveSchedulesMock.mockResolvedValue({
      updated: 1,
      details: [],
    });
  });

  it("GET은 승인된 채널의 상태만 조회하고 스케줄을 수정하지 않는다", async () => {
    const response = await handleLiveStatus(
      new Request(
        `https://example.com/api/live-status?channelIds=${channelId.toUpperCase()},${channelId}`,
      ),
      makeEnv(),
    );
    const body = (await response.json()) as {
      items: unknown[];
      scheduleAutoFill: { updated: number };
    };

    expect(response.status).toBe(200);
    expect(body.items).toEqual([{ channelId, content: liveContent }]);
    expect(body.scheduleAutoFill).toEqual({ updated: 0 });
    expect(requireAdminUserMock).not.toHaveBeenCalled();
    expect(isLiveScheduleAutoFillEnabledMock).not.toHaveBeenCalled();
    expect(autoFillUndecidedLiveSchedulesMock).not.toHaveBeenCalled();
  });

  it("조건부 재검증 요청에도 캐시된 JSON 본문을 200으로 반환한다", async () => {
    const url =
      `https://example.com/api/live-status?channelIds=${channelId}`;
    const firstResponse = await handleLiveStatus(
      new Request(url),
      makeEnv(),
    );
    const etag = firstResponse.headers.get("ETag");

    expect(firstResponse.status).toBe(200);
    expect(etag).toBeTruthy();

    const revalidatedResponse = await handleLiveStatus(
      new Request(url, {
        headers: { "If-None-Match": etag ?? "" },
      }),
      makeEnv(),
    );
    const body = (await revalidatedResponse.json()) as {
      items: unknown[];
    };

    expect(revalidatedResponse.status).toBe(200);
    expect(body.items).toEqual([{ channelId, content: liveContent }]);
    expect(fetchChzzkLiveStatusMock).toHaveBeenCalledOnce();
  });

  it("debug 조회는 관리자 인증을 요구한다", async () => {
    requireAdminUserMock.mockResolvedValueOnce({
      ok: false,
      response: new Response("Unauthorized", { status: 401 }),
    });

    const response = await handleLiveStatus(
      new Request(
        `https://example.com/api/live-status?channelIds=${channelId}&debug=1`,
      ),
      makeEnv(),
    );

    expect(response.status).toBe(401);
    expect(fetchChzzkLiveStatusWithDebugMock).not.toHaveBeenCalled();
  });

  it("활성 멤버 allowlist에 없는 채널은 400으로 거부한다", async () => {
    const response = await handleLiveStatus(
      new Request(
        `https://example.com/api/live-status?channelIds=${unapprovedChannelId}`,
      ),
      makeEnv(),
    );

    expect(response.status).toBe(400);
    expect(fetchChzzkLiveStatusMock).not.toHaveBeenCalled();
  });

  it("관리자 POST command만 스케줄 자동 입력을 수행한다", async () => {
    const snapshotResponse = await handleLiveStatus(
      new Request(
        `https://example.com/api/live-status?channelIds=${channelId}`,
      ),
      makeEnv(),
    );
    const snapshot = await snapshotResponse.json() as {
      snapshotVersion: string;
    };
    const response = await handleLiveScheduleAutoFill(
      new Request(
        "https://example.com/api/operations/live-schedule/auto-fill",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channelIds: [channelId],
            snapshotVersion: snapshot.snapshotVersion,
          }),
        },
      ),
      makeEnv(),
    );
    const body = (await response.json()) as {
      checkedChannelCount: number;
      scheduleAutoFill: { updated: number };
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      checkedChannelCount: 1,
      scheduleAutoFill: { updated: 1 },
    });
    expect(isLiveScheduleAutoFillEnabledMock).toHaveBeenCalledWith(fakeDb);
    expect(autoFillUndecidedLiveSchedulesMock).toHaveBeenCalledWith(fakeDb, [
      { channelId, content: liveContent },
    ]);
    expect(auditValuesMock).toHaveBeenCalled();
  });

  it("스케줄 반영 후 감사 로그 저장 실패는 성공 응답을 뒤집지 않는다", async () => {
    const auditError = new Error("audit unavailable");
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    auditValuesMock.mockRejectedValueOnce(auditError);
    const snapshotResponse = await handleLiveStatus(
      new Request(
        `https://example.com/api/live-status?channelIds=${channelId}`,
      ),
      makeEnv(),
    );
    const snapshot = await snapshotResponse.json() as {
      snapshotVersion: string;
    };

    const response = await handleLiveScheduleAutoFill(
      new Request(
        "https://example.com/api/operations/live-schedule/auto-fill",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channelIds: [channelId],
            snapshotVersion: snapshot.snapshotVersion,
          }),
        },
      ),
      makeEnv(),
    );
    const body = (await response.json()) as {
      checkedChannelCount: number;
      scheduleAutoFill: { updated: number };
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      checkedChannelCount: 1,
      scheduleAutoFill: { updated: 1 },
    });
    expect(autoFillUndecidedLiveSchedulesMock).toHaveBeenCalledOnce();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to write live schedule auto-fill audit",
      auditError,
    );

    consoleErrorSpy.mockRestore();
  });
});
