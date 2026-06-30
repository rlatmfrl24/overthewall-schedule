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
    const fetchMock = vi.fn(async () => jsonResponse());
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
    const fetchMock = vi.fn(async () => jsonResponse());
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
});
