import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./client";

const jsonResponse = () =>
  new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the JSON content type for json payloads", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse());
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/example", {
      method: "POST",
      json: { value: "test" },
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;

    expect(new Headers(init?.headers).get("Content-Type")).toBe(
      "application/json",
    );
  });

  it("does not force a JSON content type for FormData uploads", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse());
    vi.stubGlobal("fetch", fetchMock);
    const formData = new FormData();
    formData.append("file", new Blob(["image"], { type: "image/png" }), "a.png");

    await apiFetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;

    expect(init?.body).toBe(formData);
    expect(new Headers(init?.headers).has("Content-Type")).toBe(false);
  });

  it("Clerk token을 Authorization header로 추가하고 호출자 header를 우선한다", async () => {
    const getToken = vi.fn().mockResolvedValue("session-token");
    vi.stubGlobal("window", { Clerk: { session: { getToken } } });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse());
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/example", {
      headers: {
        Authorization: "Bearer caller-token",
        "X-Request-ID": "request-1",
      },
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = new Headers(init?.headers);
    expect(getToken).toHaveBeenCalledOnce();
    expect(headers.get("Authorization")).toBe("Bearer caller-token");
    expect(headers.get("X-Request-ID")).toBe("request-1");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("Latin-1 범위를 벗어난 token은 Authorization header에 넣지 않는다", async () => {
    vi.stubGlobal("window", {
      Clerk: {
        session: {
          getToken: vi.fn().mockResolvedValue("토큰"),
        },
      },
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse());
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/example");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
  });

  it.each([
    {
      name: "token 조회가 실패하는 경우",
      windowValue: {
        Clerk: {
          session: {
            getToken: vi.fn().mockRejectedValue(new Error("session failed")),
          },
        },
      },
    },
    {
      name: "Clerk session이 없는 경우",
      windowValue: { Clerk: {} },
    },
    {
      name: "빈 token을 반환하는 경우",
      windowValue: {
        Clerk: {
          session: {
            getToken: vi.fn().mockResolvedValue(null),
          },
        },
      },
    },
  ])("$name 익명 요청으로 계속한다", async ({ windowValue }) => {
    vi.stubGlobal("window", windowValue);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse());
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/example");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
  });

  it("json option을 문자열화하고 기존 body보다 우선한다", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse());
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/example", {
      method: "PUT",
      body: "ignored",
      json: { enabled: true },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/example",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ enabled: true }),
      }),
    );
  });

  it("오류 응답의 message와 status를 보존한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response("Invalid request", { status: 422 }),
        ),
    );

    await expect(apiFetch("/api/example")).rejects.toMatchObject({
      message: "Invalid request",
      status: 422,
    });
  });

  it("본문 없는 오류 응답에는 기본 message를 사용한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("", { status: 500 })),
    );

    await expect(apiFetch("/api/example")).rejects.toMatchObject({
      message: "API request failed",
      status: 500,
    });
  });

  it.each([
    {
      name: "204 응답",
      response: new Response(null, { status: 204 }),
    },
    {
      name: "빈 200 응답",
      response: new Response("", { status: 200 }),
    },
  ])("$name은 null로 반환한다", async ({ response }) => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(response),
    );

    await expect(apiFetch("/api/example")).resolves.toBeNull();
  });

  it("JSON이 아닌 응답은 원문 문자열로 반환한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response("updated", {
            headers: { "Content-Type": "text/plain" },
          }),
        ),
    );

    await expect(apiFetch<string>("/api/example")).resolves.toBe(
      "updated",
    );
  });

  it("Content-Type이 없는 응답도 원문 문자열로 반환한다", async () => {
    const response = {
      ok: true,
      status: 200,
      headers: new Headers(),
      text: vi.fn().mockResolvedValue("raw"),
    } as unknown as Response;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(response),
    );

    await expect(apiFetch<string>("/api/example")).resolves.toBe("raw");
  });
});
