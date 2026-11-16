import { expect, it, vi } from "vitest";
import { FlashLiteScheduleImageReader } from "./flash-lite-schedule-image-reader";

const keys = { openRouter: "router-key", gemini: "count-key" };
const image = { bytes: new Uint8Array([1]), mediaType: "image/png", members: [{ uid: 1, name: "하루" }] };
const result = { rows: [{ sourceMemberName: "하루", date: null, sourceDate: "목", weekday: 4, time: "25:00", timeState: "specified", status: "방송", headline: "문 스위퍼즈", subtitle: "합방" }], yearText: null, warnings: [], overflow: false };

it("preserves the global receiver required by native Worker fetch", async () => {
  const nativeFetch = vi.fn<typeof fetch>(function (this: unknown) {
    if (this !== globalThis) throw new TypeError("Illegal invocation: incorrect this reference");
    return Promise.resolve(Response.json({ totalTokens: 3000 }));
  });
  const reader = new FlashLiteScheduleImageReader(keys, nativeFetch);
  await expect(reader.count({ bytes: new Uint8Array([1]), mediaType: "image/png", members: [] }, new AbortController().signal)).resolves.toBe(3000);
  expect(nativeFetch.mock.contexts[0]).toBe(globalThis);
});

it("preflights input and reads Flash-Lite minimal through the pinned provider without fallback", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ totalTokens: 3000 }))
    .mockResolvedValueOnce(Response.json({ model: "google/gemini-3.5-flash-lite", provider: "Google AI Studio", usage: { prompt_tokens: 3000, completion_tokens: 400, cost: 0.0019 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(result) } }] }));
  const reader = new FlashLiteScheduleImageReader(keys, fetcher);
  const signal = new AbortController().signal;
  expect(await reader.count(image, signal)).toBe(3000);
  expect(await reader.read(image, signal)).toMatchObject({ draft: { model: "gemini-3.5-flash-lite", rows: [{ memberUid: 1, title: "문 스위퍼즈\n합방", startTime: "01:00", dateShiftDays: 1, needsWeekConfirmation: true }] }, usage: { inputTokens: 3000, outputTokens: 400, costNanoUsd: 1_900_000 } });
  expect(fetcher.mock.calls[0][0]).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:countTokens");
  const countBody = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
  expect(countBody.generateContentRequest).toMatchObject({ model: "models/gemini-3.5-flash-lite", generationConfig: { mediaResolution: "MEDIA_RESOLUTION_HIGH", thinkingConfig: { thinkingLevel: "MINIMAL" }, maxOutputTokens: 12000 } });
  expect(countBody.generateContentRequest.contents[0].parts[0].mediaResolution).toEqual({ level: "MEDIA_RESOLUTION_ULTRA_HIGH" });
  expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("x-goog-api-key")).toBe("count-key");
  const body = JSON.parse(String(fetcher.mock.calls[1][1]?.body));
  expect(fetcher.mock.calls[1][0]).toBe("https://openrouter.ai/api/v1/chat/completions");
  expect(new Headers(fetcher.mock.calls[1][1]?.headers).get("Authorization")).toBe("Bearer router-key");
  expect(body).toMatchObject({ model: "google/gemini-3.5-flash-lite", reasoning: { effort: "minimal" }, max_tokens: 12000, stream: false,
    provider: { only: ["google-ai-studio"], allow_fallbacks: false, require_parameters: true, data_collection: "deny", max_price: { prompt: 0.3, completion: 2.5 } } });
  expect(body.messages[1].content[0].image_url.detail).toBe("original");
  expect(body.tools).toBeUndefined();
  expect(fetcher.mock.calls[1][1]?.signal).toBe(signal);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it.each(["length", "content_filter"])("rejects %s output while preserving chargeable usage", async finish_reason => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ model: "google/gemini-3.5-flash-lite", usage: { prompt_tokens: 3000, completion_tokens: 12000 }, choices: [{ finish_reason, message: { content: JSON.stringify(result) } }] }));
  const read = await new FlashLiteScheduleImageReader(keys, fetcher).read(image, new AbortController().signal);
  expect(read).toEqual({ draft: null, usage: { inputTokens: 3000, outputTokens: 12000 } });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("does not expose provider errors or retry failures", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("private upstream error", { status: 402 }));
  await expect(new FlashLiteScheduleImageReader(keys, fetcher).read(image, new AbortController().signal)).rejects.toThrow("자동 재시도하지 않습니다");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("uses the current site's roster to resolve a printed handle without accepting another member",async()=>{
  const content={...result,rows:[{...result.rows[0],sourceMemberName:"@on_haru",matchedMemberName:"온하루"},{...result.rows[0],sourceMemberName:"외부 멤버",matchedMemberName:"다른 사이트 멤버"},{...result.rows[0],sourceMemberName:null,matchedMemberName:"온하루"}]};
  const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({totalTokens:3100})).mockResolvedValueOnce(Response.json({model:"google/gemini-3.5-flash-lite",usage:{prompt_tokens:3100,completion_tokens:400},choices:[{finish_reason:"stop",message:{content:JSON.stringify(content)}}]}));
  const reader=new FlashLiteScheduleImageReader(keys,fetcher),signal=new AbortController().signal;
  const input={...image,members:[{uid:6,name:"온하루",code:"on_haru",url_twitter:"https://x.com/otw_haru"}]};
  await reader.count(input,signal);
  expect((await reader.read(input,signal)).draft?.rows.map(r=>r.memberUid)).toEqual([6,null,null]);
  const count=JSON.parse(String(fetcher.mock.calls[0][1]?.body)).generateContentRequest.systemInstruction.parts[0].text;
  const prompt=JSON.parse(String(fetcher.mock.calls[1][1]?.body)).messages[0].content;
  expect(count).toBe(prompt);expect(prompt).toContain('"name":"온하루"');expect(prompt).toContain('"code":"on_haru"');
});

it("counts every detail and sends all views in one generation with overlap reconciliation", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ totalTokens: 12000 }))
    .mockResolvedValueOnce(Response.json({ model: "google/gemini-3.5-flash-lite", usage: { prompt_tokens: 12000, completion_tokens: 400 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(result) } }] }));
  const detailed = { ...image, details: (["top-left", "top-right", "bottom-left", "bottom-right"] as const).map((region, i) => ({ region, bytes: new Uint8Array([i + 2]), mediaType: "image/png" })) };
  const reader = new FlashLiteScheduleImageReader(keys, fetcher), signal = new AbortController().signal;
  expect(await reader.count(detailed, signal)).toBe(12000);
  expect((await reader.read(detailed, signal)).draft?.rows).toHaveLength(1);
  const count = JSON.parse(String(fetcher.mock.calls[0][1]?.body)).generateContentRequest;
  expect(count.contents[0].parts.filter((p: { inlineData?: unknown }) => p.inlineData)).toHaveLength(5);
  const body = JSON.parse(String(fetcher.mock.calls[1][1]?.body));
  const images = body.messages[1].content.filter((p: { type: string }) => p.type === "image_url");
  expect(images).toHaveLength(5);
  expect(new Set(images.map((p: { image_url: { url: string } }) => p.image_url.url)).size).toBe(5);
  expect(body.messages[0].content).toContain("each event once");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
