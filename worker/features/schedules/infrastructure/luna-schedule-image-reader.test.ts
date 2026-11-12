import { expect, it, vi } from "vitest";
import { LunaScheduleImageReader } from "./luna-schedule-image-reader";

it("uses_standard_none_and_enforces_50000_input_12000_output_20000ms", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ input_tokens: 3000 }))
    .mockResolvedValueOnce(Response.json({ status: "incomplete", usage: { input_tokens: 3000, output_tokens: 12000 }, output: [] }));
  const reader = new LunaScheduleImageReader("private-key", fetcher);
  const image = { bytes: new Uint8Array([1]), mediaType: "image/png", members: [{ uid: 1, name: "하루" }] };
  const signal = new AbortController().signal;
  expect(await reader.count(image, signal)).toBe(3000);
  expect(await reader.read(image, signal)).toEqual({ draft: null, usage: { inputTokens: 3000, outputTokens: 12000 } });
  const body = JSON.parse(String(fetcher.mock.calls[1][1]?.body));
  expect(body).toMatchObject({ model: "gpt-6-luna", store: false, service_tier: "default", reasoning: { effort: "none" }, max_output_tokens: 12000 });
  expect(body.tools).toBeUndefined();
  expect(fetcher.mock.calls[1][1]?.signal).toBe(signal);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
