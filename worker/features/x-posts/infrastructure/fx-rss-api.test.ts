import { afterEach, expect, it, vi } from "vitest";
import { fetchFxRssFeed, parseFxRssFeed } from "./fx-rss-api";

const item = (id: string, handle = "member", extra = "") => `<item><guid isPermaLink="true">https://x.com/${handle}/status/${id}</guid><link>https://x.com/${handle}/status/${id}?a=1&amp;b=2</link><pubDate>Tue, 03 Nov 2026 00:00:00 GMT</pubDate>${extra}</item>`;
const feed = (items: string) => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>Member</title>${items}</channel></rss>`;
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("filters_context_and_deduplicates_guid", () => {
  const page = parseFxRssFeed(feed(item("123", "MEMBER", "<description><![CDATA[<p>not parsed as XML & text</p>]]></description><media:content url=\"https://pbs.twimg.com/a.jpg\"/>") + item("125", "other") + item("123")), "Member");
  expect(page.entries).toEqual([{ id: "123", handle: "member", createdAtHint: Date.parse("2026-11-03T00:00:00Z") }]);
  expect(page.rawCount).toBe(3);
});
it("preserves raw counts when a valid 200 feed shrinks from 100 to 35", async () => {
  const xml = (count: number) => feed(Array.from({ length: count }, (_, n) => item(String(n + 1))).join(""));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(xml(100))).mockResolvedValueOnce(new Response(xml(35))));
  expect((await fetchFxRssFeed("member")).rawCount).toBe(100);
  expect((await fetchFxRssFeed("member")).rawCount).toBe(35);
});
it.each([
  '<!DOCTYPE rss [<!ENTITY remote SYSTEM "https://private.example/">]><rss><channel>&remote;</channel></rss>',
  '<!DOCTYPE rss><rss version="2.0"><channel/></rss>',
  "<rss><channel></rss>",
  "<feed/>",
  '<rss version="2.0"/>',
  '<rss version="2.0"><channel/><channel/></rss>',
  feed(item("123").replace("Tue, 03 Nov 2026 00:00:00 GMT", "bad")),
  feed(item("abc")),
  feed(item("123").replace("https://x.com/member/status/123</guid>", "https://evil.example/member/status/123</guid>")),
  feed(item("123").replace("<pubDate>", "<pubDate/><pubDate>")),
  feed(Array.from({ length: 101 }, (_, n) => item(String(n + 1))).join("")),
])("rejects_dtd_and_malformed_xml %s", xml => {
  expect(() => parseFxRssFeed(xml, "member")).toThrow();
});
it("uses fixed unauthenticated RSS URL and a 15 second abort signal", async () => {
  const timeout = vi.spyOn(AbortSignal, "timeout");
  const fetchMock = vi.fn().mockResolvedValue(new Response(feed(item("123"))));
  vi.stubGlobal("fetch", fetchMock);
  await fetchFxRssFeed("MEMBER");
  expect(fetchMock.mock.calls[0][0]).toBe("https://fxtwitter.com/member/feed.xml?count=100&with_replies=true");
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "manual", headers: { Accept: "application/rss+xml", "User-Agent": "OTWSchedule/1.0 (+https://otw-schedule.info)" } });
  expect(timeout).toHaveBeenCalledWith(15_000);
});
it("rejects_redirect_and_oversized_stream", async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(2_000_001)); }, cancel });
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "https://other.example" } })).mockResolvedValueOnce(new Response(stream));
  vi.stubGlobal("fetch", fetchMock);
  await expect(fetchFxRssFeed("member")).rejects.toMatchObject({ code: "fx_http_302" });
  await expect(fetchFxRssFeed("member")).rejects.toMatchObject({ code: "fx_invalid_payload" });
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it("rejects invalid UTF8 and non-UTF8 declarations", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(new Uint8Array([0xc3, 0x28]))).mockResolvedValueOnce(new Response(feed("").replace("UTF-8", "ISO-8859-1"))));
  await expect(fetchFxRssFeed("member")).rejects.toMatchObject({ code: "fx_invalid_payload" });
  await expect(fetchFxRssFeed("member")).rejects.toMatchObject({ code: "fx_invalid_payload" });
});
it("accepts exactly 2,000,000 bytes with a UTF8 character split between chunks", async () => {
  const xml = feed(item("123", "member", "<description>한</description>"));
  const encoded = new TextEncoder().encode(xml);
  const padding = " ".repeat(2_000_000 - encoded.byteLength);
  const bytes = new TextEncoder().encode(xml + padding);
  const split = new TextEncoder().encode(xml.slice(0, xml.indexOf("한"))).byteLength + 1;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes.slice(0, split)); controller.enqueue(bytes.slice(split)); controller.close(); } });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream)));
  expect((await fetchFxRssFeed("member")).entries[0].id).toBe("123");
});
it("maps timeout and network failures without exposing upstream details", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new DOMException("timed out", "TimeoutError")).mockRejectedValueOnce(new TypeError("private detail")));
  await expect(fetchFxRssFeed("member")).rejects.toMatchObject({ code: "fx_timeout" });
  await expect(fetchFxRssFeed("member")).rejects.toMatchObject({ code: "fx_network_error" });
});
