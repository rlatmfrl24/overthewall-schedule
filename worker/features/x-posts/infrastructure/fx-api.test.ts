import { afterEach, expect, it, vi } from "vitest";
import { fetchFxPostPreview, fetchFxStatus, fetchFxTimelinePage, parseFxStatus, parseFxTimelinePage } from "./fx-api";

const raw = (id: string, handle = "member") => ({ type: "status", id, text: id, author: { id: handle === "member" ? "101" : "999", screen_name: handle, protected: false }, created_at: "Tue Nov 03 00:00:00 +0000 2026", media: {} });
afterEach(() => vi.unstubAllGlobals());
it("reads the trusted numeric account without depending on provider handle resolution", async () => {
  const fetchMock = vi.fn(async (url: string) => new URL(url).pathname === "/2/profile/id:101/statuses"
    ? Response.json({ code: 200, results: [raw("123")], cursor: { bottom: "next" } })
    : Response.json({ code: 404, results: [], cursor: { top: null, bottom: null } }, { status: 404 }));
  vi.stubGlobal("fetch", fetchMock);
  const result = await fetchFxTimelinePage("member", "a+b", "101");
  expect(result.posts.map(post => post.id)).toEqual(["123"]);
  expect(result.nextCursor).toBe("next");
  expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("cursor")).toBe("a+b");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("validates the trusted numeric ID before sending a provider request", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ code: 200, results: [], cursor: {} }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(fetchFxTimelinePage("member", null, "101/path")).rejects.toMatchObject({ code: "fx_invalid_payload" });
  expect(fetchMock).not.toHaveBeenCalled();
});
it("rejects a renamed pinned author instead of acknowledging an empty page", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ code: 200, results: [{ ...raw("123"), author: { id: "101", screen_name: "renamed_member", protected: false } }], cursor: {} })));
  await expect(fetchFxTimelinePage("member", null, "101")).rejects.toMatchObject({ code: "fx_identity_mismatch" });
});
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
  expect(options.headers).toEqual({ Accept: "application/json", "User-Agent": "OTWSchedule/1.0 (+https://otw-schedule.info)" });
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
it("validates_status_identity_and_gif with the existing relations parser", () => {
  const status = { ...raw("123"), media: { all: [{ id: "321", type: "gif", url: "https://video.twimg.com/a.mp4" }] }, quote: raw("124", "other"), replying_to: { status: "125", screen_name: "other" } };
  const post = parseFxStatus({ code: 200, status }, "member", "101", "123");
  expect(post.media[0].type).toBe("animated_gif");
  expect(post.quote?.post?.id).toBe("124");
  expect(post.reply?.postId).toBe("125");
  expect(() => parseFxStatus({ code: 200, status: raw("123", "other") }, "member", "101", "123")).toThrowError(expect.objectContaining({ code: "fx_candidate_excluded" }));
  expect(() => parseFxStatus({ code: 200, status: { ...raw("123"), reposted_by: {} } }, "member", "101", "123")).toThrowError(expect.objectContaining({ code: "fx_candidate_excluded" }));
});
it("keeps RSS status candidates when the quoted tombstone has no ID or the reply author is unavailable", () => {
  const status = { ...raw("123"), quote: { type: "tombstone", reason: "deleted" }, replying_to: { status: "122" } };
  expect(parseFxStatus({ code: 200, status }, "member", "101", "123")).toMatchObject({
    id: "123", quote: null, reply: { postId: "122", targetUsername: null, post: null },
  });
});
it.each([
  [{ code: 200, status: raw("124") }, "fx_identity_mismatch"],
  [{ code: 200, status: { ...raw("123"), author: { id: "999", screen_name: "member", protected: false } } }, "fx_identity_mismatch"],
  [{ code: 200, status: { ...raw("123"), author: { id: "101", screen_name: "member", protected: true } } }, "fx_private_author"],
  [{ code: 404 }, "fx_payload_404"],
  [{ code: 200, status: { ...raw("123"), created_at: "bad" } }, "fx_invalid_payload"],
  [{ code: 200, status: { ...raw("123"), media: { all: [{ id: "321", type: "photo", url: "https://evil.example/a.jpg" }] } } }, "fx_invalid_payload"],
])("rejects invalid free status responses", (payload, code) => {
  expect(() => parseFxStatus(payload, "member", "101", "123")).toThrowError(expect.objectContaining({ code }));
});
it("fetches an individual status only from the fixed free endpoint", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 200, status: raw("123") })));
  vi.stubGlobal("fetch", fetchMock);
  expect((await fetchFxStatus("123", "member", "101")).id).toBe("123");
  expect(fetchMock.mock.calls[0][0]).toBe("https://api.fxtwitter.com/2/status/123");
  await expect(fetchFxStatus("123/456", "member", "101")).rejects.toMatchObject({ code: "fx_invalid_payload" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("accepts only the requested public reply original and validates a known author ID", async () => {
  const original = raw("122", "other");
  const response = (status: unknown) => Response.json({ code: 200, status });
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(response(original))
    .mockResolvedValueOnce(response({ ...original, id: "123" }))
    .mockResolvedValueOnce(response({ ...original, author: { ...original.author, protected: true } }))
    .mockResolvedValueOnce(response(original));
  vi.stubGlobal("fetch", fetchMock);
  expect(await fetchFxPostPreview("122", "999")).toMatchObject({ id: "122", username: "other" });
  await expect(fetchFxPostPreview("122")).resolves.toBeNull();
  await expect(fetchFxPostPreview("122")).resolves.toBeNull();
  await expect(fetchFxPostPreview("122", "101")).resolves.toBeNull();
  expect(fetchMock.mock.calls[0][0]).toBe("https://api.fxtwitter.com/2/status/122");
});
