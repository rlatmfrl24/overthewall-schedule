import { afterEach, expect, it, vi } from "vitest";
import { fetchFxTimelinePage, parseFxTimelinePage } from "./fx-api";

const raw = (id: string, handle = "member") => ({ type: "status", id, text: id, author: { id: handle === "member" ? "101" : "999", screen_name: handle, protected: false }, created_at: "Tue Nov 03 00:00:00 +0000 2026", media: {} });
afterEach(() => vi.unstubAllGlobals());
it("filters context and reposts, deduplicates unsorted own posts and normalizes GIF", () => {
  const payload = { code: 200, results: [raw("124"), raw("120", "other"), raw("123"), raw("124"), { ...raw("125"), reposted_by: { screen_name: "member" } }, { ...raw("126"), media: { all: [{ id: "321", type: "gif", url: "https://video.twimg.com/a.mp4", thumbnail_url: "https://pbs.twimg.com/a.jpg" }] } }], cursor: { bottom: "next" } };
  const result = parseFxTimelinePage(payload, "member", "101");
  expect(result.posts.map(post => post.id)).toEqual(["124", "123", "126"]);
  expect(result.posts.every(post => post.username === "member")).toBe(true);
  expect(result.posts[2].media[0].type).toBe("animated_gif");
  expect(result.rawCount).toBe(6);
  expect(result.nextCursor).toBe("next");
});
it.each([
  { code: 404, results: [] }, { code: 200, results: null },
  { code: 200, results: [{ ...raw("123"), created_at: "bad" }] },
  { code: 200, results: [{ ...raw("123"), author: { id: "999", screen_name: "member" } }] },
  { code: 200, results: [{ ...raw("123"), media: { all: [{ type: "photo", url: "javascript:alert(1)" }] } }] },
])("rejects an invalid provider payload", payload => {
  expect(() => parseFxTimelinePage(payload, "member", "101")).toThrow();
});
it("uses only the fixed unauthenticated provider host and rejects payload failures", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ code: 200, results: [raw("123")], cursor: {} }))).mockResolvedValueOnce(new Response(JSON.stringify({ code: 404 })));
  vi.stubGlobal("fetch", fetchMock);
  await fetchFxTimelinePage("member", "a+b", "101");
  const [url, options] = fetchMock.mock.calls[0];
  expect(new URL(url).origin).toBe("https://api.fxtwitter.com");
  expect(new URL(url).searchParams.get("cursor")).toBe("a+b");
  expect(options.headers).toEqual({ Accept: "application/json" });
  expect(options.redirect).toBe("manual");
  await expect(fetchFxTimelinePage("member", null, "101")).rejects.toMatchObject({ code: "fx_payload_404" });
});
it("rejects a redirect without following another host", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { Location: "https://other.example/" } }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(fetchFxTimelinePage("member", null, "101")).rejects.toMatchObject({ code: "fx_http_302" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("accepts observed public http links while requiring HTTPS media", () => {
  const post = { ...raw("123"), raw_text: { facets: [{ type: "url", original: "https://t.co/a", replacement: "http://chzzk.me/member" }] } };
  expect(parseFxTimelinePage({ code: 200, results: [post] }, "member", "101").posts[0].links?.[0].expandedUrl).toBe("http://chzzk.me/member");
});
