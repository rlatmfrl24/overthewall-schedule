import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./client";

describe("apiFetch", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (globalThis as { window?: unknown }).window;
  });

  it("json payload, actor header, json 응답을 처리한다", async () => {
    (globalThis as { window?: unknown }).window = {
      Clerk: {
        user: {
          id: "user_1",
          fullName: "Admin User",
        },
      },
    };

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await apiFetch<{ ok: boolean }>("/api/test", {
      method: "POST",
      json: { a: 1 },
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ a: 1 }),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-otw-user-id": "user_1",
          "x-otw-user-name": "Admin User",
        }),
      }),
    );
  });

  it("204/empty 응답은 null로 반환한다", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await apiFetch<null>("/api/empty");
    expect(result).toBeNull();
  });

  it("json이 아닌 응답은 raw text로 반환한다", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("plain-text", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );

    const result = await apiFetch<string>("/api/raw");
    expect(result).toBe("plain-text");
  });

  it("실패 응답은 status/message를 포함해 throw 한다", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("boom", { status: 500, statusText: "Internal Error" }),
    );

    await expect(apiFetch("/api/fail")).rejects.toMatchObject({
      message: "boom",
      status: 500,
    });
  });
});
