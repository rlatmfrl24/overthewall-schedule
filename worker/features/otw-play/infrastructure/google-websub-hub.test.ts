import { describe, expect, it, vi } from "vitest";
import { GoogleWebsubHubClient, YOUTUBE_WEBSUB_HUB_URL } from "./google-websub-hub";

const request = {
  mode: "subscribe" as const,
  topicUrl: `https://www.youtube.com/xml/feeds/videos.xml?channel_id=UC${"A".repeat(22)}`,
  callbackUrl: "https://example.com/api/play/webhooks/youtube/callback-token",
  hubSecret: "derived-secret",
};

describe("GoogleWebsubHubClient", () => {
  it("sends the exact asynchronous subscription form", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 202 }));
    await new GoogleWebsubHubClient(fetcher).request(request);

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(YOUTUBE_WEBSUB_HUB_URL);
    expect(init?.method).toBe("POST");
    const body = init?.body as URLSearchParams;
    expect(Object.fromEntries(body.entries())).toEqual({
      "hub.callback": request.callbackUrl,
      "hub.mode": "subscribe",
      "hub.topic": request.topicUrl,
      "hub.verify": "async",
      "hub.secret": request.hubSecret,
    });
  });

  it("does not invoke an injected fetch implementation as an instance method", async () => {
    const fetcher = vi.fn(function (this: unknown) {
      if (this !== undefined) throw new TypeError("Illegal invocation");
      return Promise.resolve(new Response(null, { status: 202 }));
    }) as unknown as typeof fetch;

    await expect(new GoogleWebsubHubClient(fetcher).request(request)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("retries a transient hub response once", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));

    await expect(new GoogleWebsubHubClient(fetcher).request(request)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("returns a sanitized provider status for a terminal response", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("provider detail", { status: 400 }));

    await expect(new GoogleWebsubHubClient(fetcher).request(request)).rejects.toEqual(
      expect.objectContaining({ code: "hub_http_400" }),
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
