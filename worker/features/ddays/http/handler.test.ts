import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";

vi.mock("../../../platform/auth", () => ({
  requireAdminUser: vi.fn(async () => ({
    ok: true,
    user: { id: "admin" },
  })),
}));

import { createHandleDDays } from "../index";
import type { DDayRepository } from "../application/ports/dday-repository";

const repository = {
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
} as DDayRepository;
const handleDDays = createHandleDDays(() => repository);

describe("D-Day command HTTP boundary", () => {
  beforeEach(() => {
    vi.mocked(repository.list).mockReset();
    vi.mocked(repository.create).mockReset();
    vi.mocked(repository.update).mockReset();
    vi.mocked(repository.remove).mockReset();
  });

  it("returns 400 for malformed JSON instead of throwing to the index", async () => {
    const response = await handleDDays(
      new Request("https://example.com/api/ddays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
      { otw_db: {} as D1Database } as Env,
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Malformed JSON");
  });

  it("조회 결과와 noCache 계약을 application port에서 그대로 반환한다", async () => {
    vi.mocked(repository.list).mockResolvedValueOnce([
      {
        id: 1,
        title: "데뷔일",
        date: "2026-02-13",
        description: null,
        color: null,
        type: "debut",
        created_at: null,
      },
    ]);

    const response = await handleDDays(
      new Request("https://example.com/api/ddays?noCache=1"),
      { otw_db: {} as D1Database } as Env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(repository.list).toHaveBeenCalledTimes(1);
  });

  it("검증·정규화한 생성 입력만 application port로 전달한다", async () => {
    vi.mocked(repository.create).mockResolvedValueOnce(true);

    const response = await handleDDays(
      new Request("https://example.com/api/ddays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: " 생일 ",
          date: " 2026-03-14 ",
          type: "birthday",
        }),
      }),
      { otw_db: {} as D1Database } as Env,
    );

    expect(response.status).toBe(201);
    expect(repository.create).toHaveBeenCalledWith({
      title: "생일",
      date: "2026-03-14",
      description: null,
      color: null,
      type: "birthday",
    });
  });
});
