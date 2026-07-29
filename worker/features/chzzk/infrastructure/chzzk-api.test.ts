import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearChzzkServiceCachesForTests,
  fetchChzzkClipsBatch,
  fetchChzzkVideosBatch,
} from "./chzzk-api";

type CacheRow = {
  key: string;
  type: "vods" | "clips";
  value: string;
  fetched_at: number;
  expires_at: number;
  stale_until: number;
  last_status: number | null;
  last_error: string | null;
};

const makeVideoContent = (videoId: string, extra: Record<string, unknown> = {}) => ({
  page: 0,
  size: 10,
  totalCount: 1,
  totalPages: 1,
  data: [{ videoId }],
  ...extra,
});

const makeClipContent = (clipUID: string) => ({
  size: 10,
  page: { next: null, prev: null },
  data: [{ clipUID }],
});

const makeCacheRow = (
  key: string,
  type: CacheRow["type"],
  value: unknown,
  options: { fresh?: boolean; expired?: boolean } = {},
): CacheRow => {
  const timestamp = Date.now();
  return {
    key,
    type,
    value: JSON.stringify(value),
    fetched_at: timestamp - 1_000,
    expires_at: options.fresh ? timestamp + 60_000 : timestamp - 1,
    stale_until: options.expired ? timestamp - 1 : timestamp + 60_000,
    last_status: 200,
    last_error: null,
  };
};

const makeCacheDb = (
  initialRows: CacheRow[] = [],
  options: { failRead?: boolean; failWrite?: boolean } = {},
) => {
  const cache = new Map(initialRows.map((row) => [row.key, row]));
  let readCount = 0;
  let writeCount = 0;
  const prepare = vi.fn((sql: string) => ({
    bind: (...bindings: unknown[]) => ({
      all: async () => {
        readCount += 1;
        if (options.failRead) throw new Error("read failed");
        return {
          results: bindings
            .map((key) => cache.get(String(key)))
            .filter((row): row is CacheRow => Boolean(row)),
        };
      },
      run: async () => {
        writeCount += 1;
        if (options.failWrite) throw new Error("write failed");
        expect(sql).toContain("INSERT INTO chzzk_api_cache");
        for (let index = 0; index < bindings.length; index += 8) {
          const row: CacheRow = {
            key: String(bindings[index]),
            type: String(bindings[index + 1]) as CacheRow["type"],
            value: String(bindings[index + 2]),
            fetched_at: Number(bindings[index + 3]),
            expires_at: Number(bindings[index + 4]),
            stale_until: Number(bindings[index + 5]),
            last_status:
              bindings[index + 6] === null ? null : Number(bindings[index + 6]),
            last_error:
              bindings[index + 7] === null ? null : String(bindings[index + 7]),
          };
          cache.set(row.key, row);
        }
        return { success: true };
      },
    }),
  }));

  return {
    db: { prepare } as unknown as Pick<D1Database, "prepare">,
    cache,
    get readCount() {
      return readCount;
    },
    get writeCount() {
      return writeCount;
    },
  };
};

describe("CHZZK worker service D1 cache", () => {
  const channelId = "a".repeat(32);
  const cacheKey = `vods:v1:${channelId}:0:10`;
  const fetchMock = vi.fn();

  beforeEach(() => {
    clearChzzkServiceCachesForTests();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("D1 fresh hit에서는 origin을 호출하지 않는다", async () => {
    const cached = makeVideoContent("cached");
    const state = makeCacheDb([
      makeCacheRow(cacheKey, "vods", cached, { fresh: true }),
    ]);

    const [result] = await fetchChzzkVideosBatch(
      [{ channelId, page: 0, size: 10, cacheable: true }],
      state.db,
    );

    expect(result?.content).toEqual(cached);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.readCount).toBe(1);
    expect(state.writeCount).toBe(0);
  });

  it("L1 fresh hit에서는 origin을 다시 호출하지 않는다", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ content: makeVideoContent("origin") }),
    );
    const request = [{ channelId, page: 0, size: 10, cacheable: false }];

    const [first] = await fetchChzzkVideosBatch(request);
    const [second] = await fetchChzzkVideosBatch(request);

    expect(first?.content?.data[0]?.videoId).toBe("origin");
    expect(second?.content?.data[0]?.videoId).toBe("origin");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cache miss에서는 origin 결과를 한 번의 multi-row UPSERT로 저장한다", async () => {
    const state = makeCacheDb();
    const content = makeVideoContent("fresh");
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      return Response.json({
        content: makeVideoContent(url.pathname.split("/").at(-2) ?? "fresh"),
      });
    });
    const requests = Array.from({ length: 8 }, (_, index) => ({
      channelId: index.toString(16).padStart(32, "0"),
      page: 0,
      size: 10,
      cacheable: true,
    }));

    const results = await fetchChzzkVideosBatch(requests, state.db);

    expect(results).toHaveLength(8);
    expect(results[0]?.content?.data).toHaveLength(content.data.length);
    expect(fetchMock).toHaveBeenCalledTimes(8);
    expect(state.readCount).toBe(1);
    expect(state.writeCount).toBe(1);
    expect(state.cache).toHaveLength(8);
  });

  it("forceRefresh는 D1 fresh를 우회하고 새 origin 결과를 저장한다", async () => {
    const state = makeCacheDb([
      makeCacheRow(cacheKey, "vods", makeVideoContent("cached"), {
        fresh: true,
      }),
    ]);
    fetchMock.mockResolvedValue(Response.json({ content: makeVideoContent("new") }));

    const [result] = await fetchChzzkVideosBatch(
      [{ channelId, page: 0, size: 10, cacheable: true }],
      state.db,
      { forceRefresh: true },
    );

    expect(result?.content?.data[0]?.videoId).toBe("new");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(state.writeCount).toBe(1);
  });

  it.each([400, 500, 429])(
    "origin HTTP %s 오류에서는 stale D1 값과 기존 TTL을 보존한다",
    async (status) => {
    const state = makeCacheDb([
      makeCacheRow(cacheKey, "vods", makeVideoContent("stale")),
    ]);
    const previous = state.cache.get(cacheKey)!;
    fetchMock.mockResolvedValue(new Response("blocked", { status }));

    const [result] = await fetchChzzkVideosBatch(
      [{ channelId, page: 0, size: 10, cacheable: true }],
      state.db,
    );

    expect(result?.content?.data[0]?.videoId).toBe("stale");
    expect(state.cache.get(cacheKey)).toMatchObject({
      value: previous.value,
      fetched_at: previous.fetched_at,
      expires_at: previous.expires_at,
      stale_until: previous.stale_until,
      last_status: status,
      last_error: "blocked",
    });
    expect(state.writeCount).toBe(1);
    },
  );

  it("origin network 오류에서는 stale D1 값을 반환한다", async () => {
    const state = makeCacheDb([
      makeCacheRow(cacheKey, "vods", makeVideoContent("stale")),
    ]);
    fetchMock.mockRejectedValue(new Error("network down"));

    const [result] = await fetchChzzkVideosBatch(
      [{ channelId, page: 0, size: 10, cacheable: true }],
      state.db,
    );

    expect(result?.content?.data[0]?.videoId).toBe("stale");
    expect(state.cache.get(cacheKey)?.last_status).toBe(0);
    expect(state.cache.get(cacheKey)?.last_error).toBe("network down");
  });

  it("malformed origin 응답도 stale fallback으로 처리한다", async () => {
    const state = makeCacheDb([
      makeCacheRow(cacheKey, "vods", makeVideoContent("stale")),
    ]);
    fetchMock.mockResolvedValue(Response.json({ content: { page: 0 } }));

    const [result] = await fetchChzzkVideosBatch(
      [{ channelId, page: 0, size: 10, cacheable: true }],
      state.db,
    );

    expect(result?.content?.data[0]?.videoId).toBe("stale");
    expect(state.cache.get(cacheKey)?.last_error).toBe("invalid_content");
  });

  it("expired D1 값은 origin 실패 시 반환하지 않는다", async () => {
    const state = makeCacheDb([
      makeCacheRow(cacheKey, "vods", makeVideoContent("expired"), {
        expired: true,
      }),
    ]);
    fetchMock.mockRejectedValue(new Error("network down"));

    const [result] = await fetchChzzkVideosBatch(
      [{ channelId, page: 0, size: 10, cacheable: true }],
      state.db,
    );

    expect(result?.content).toBeNull();
  });

  it("D1 장애는 origin 성공 응답을 막지 않는다", async () => {
    const state = makeCacheDb([], { failRead: true, failWrite: true });
    fetchMock.mockResolvedValue(
      Response.json({ content: makeVideoContent("origin") }),
    );

    const [result] = await fetchChzzkVideosBatch(
      [{ channelId, page: 0, size: 10, cacheable: true }],
      state.db,
    );

    expect(result?.content?.data[0]?.videoId).toBe("origin");
  });

  it("512KB를 넘는 응답은 반환하되 D1에 저장하지 않는다", async () => {
    const state = makeCacheDb();
    fetchMock.mockResolvedValue(
      Response.json({
        content: makeVideoContent("large", { padding: "x".repeat(513_000) }),
      }),
    );

    const [result] = await fetchChzzkVideosBatch(
      [{ channelId, page: 0, size: 10, cacheable: true }],
      state.db,
    );

    expect(result?.content?.data[0]?.videoId).toBe("large");
    expect(state.writeCount).toBe(0);
  });

  it("동시 동일 키의 origin 요청을 한 번으로 병합한다", async () => {
    let resolveFetch!: (response: Response) => void;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const request = [{ channelId, page: 0, size: 10, cacheable: false }];

    const first = fetchChzzkVideosBatch(request);
    const second = fetchChzzkVideosBatch(request);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    resolveFetch(Response.json({ content: makeVideoContent("shared") }));

    const [[firstResult], [secondResult]] = await Promise.all([first, second]);
    expect(firstResult?.content?.data[0]?.videoId).toBe("shared");
    expect(secondResult?.content?.data[0]?.videoId).toBe("shared");
  });

  it("한 batch 안의 동일 키는 origin 조회를 한 번만 수행한다", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ content: makeVideoContent("deduped") }),
    );
    const request = { channelId, page: 0, size: 10, cacheable: false };

    const results = await fetchChzzkVideosBatch([request, request]);

    expect(results).toHaveLength(2);
    expect(results.every((result) => result.content?.data[0]?.videoId === "deduped"))
      .toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("8채널 3페이지는 cache read 3회와 write 3회로 처리한다", async () => {
    const state = makeCacheDb();
    fetchMock.mockImplementation(async () =>
      Response.json({ content: makeVideoContent("batched") }),
    );
    const channelIds = Array.from({ length: 8 }, (_, index) =>
      index.toString(16).padStart(32, "0"),
    );

    for (let page = 0; page < 3; page += 1) {
      await fetchChzzkVideosBatch(
        channelIds.map((id) => ({
          channelId: id,
          page,
          size: 5,
          cacheable: true,
        })),
        state.db,
        { forceRefresh: true },
      );
    }

    expect(state.readCount).toBe(3);
    expect(state.writeCount).toBe(3);
  });

  it("클립도 D1 fresh 값을 공유한다", async () => {
    const key = `clips:v1:${channelId}:10`;
    const cached = makeClipContent("clip-cached");
    const state = makeCacheDb([
      makeCacheRow(key, "clips", cached, { fresh: true }),
    ]);

    const [result] = await fetchChzzkClipsBatch(
      [{ channelId, size: 10, cacheable: true }],
      state.db,
    );

    expect(result?.content).toEqual(cached);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
