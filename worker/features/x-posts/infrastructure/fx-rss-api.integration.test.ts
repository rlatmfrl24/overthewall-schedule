import { afterEach, expect, it, vi } from "vitest";
import { fetchFxRssFeed, parseFxRssFeed } from "./fx-rss-api";

afterEach(() => vi.unstubAllGlobals());
it("imports the actual XML parser in Workerd and reads CDATA, namespaces and escaped URLs", async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><item><guid><![CDATA[https://x.com/member/status/123?a=1&b=2]]></guid><pubDate>Tue, 03 Nov 2026 00:00:00 GMT</pubDate><description><![CDATA[<p>body & data</p>]]></description><media:content url="https://pbs.twimg.com/a.jpg?a=1&amp;b=2"/></item></channel></rss>`;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(xml)));
  expect(await fetchFxRssFeed("member")).toEqual({ entries: [{ id: "123", handle: "member", createdAtHint: Date.parse("2026-11-03T00:00:00Z") }], rawCount: 1 });
});
it("rejects valid DTD declarations and external/custom entities in Workerd", () => {
  for (const xml of [
    '<!DOCTYPE rss><rss version="2.0"><channel/></rss>',
    '<!DOCTYPE rss SYSTEM "https://private.example/dtd"><rss version="2.0"><channel/></rss>',
    '<!DOCTYPE rss [<!ENTITY remote SYSTEM "https://private.example/">]><rss version="2.0"><channel>&remote;</channel></rss>',
  ]) expect(() => parseFxRssFeed(xml, "member")).toThrowError(expect.objectContaining({ code: "fx_invalid_payload" }));
});
it("rejects invalid UTF8 bytes through the actual Workerd decoder", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([0xc3, 0x28]))));
  await expect(fetchFxRssFeed("member")).rejects.toThrowError(expect.objectContaining({ code: "fx_invalid_payload" }));
});
