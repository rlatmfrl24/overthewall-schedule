import type { WebsubHubClient } from "../application/ports/websub-repository";

export const YOUTUBE_WEBSUB_HUB_URL = "https://pubsubhubbub.appspot.com/subscribe";

export class GoogleWebsubHubClient implements WebsubHubClient {
  private readonly fetchImpl: typeof fetch;

  constructor(fetchImpl: typeof fetch = fetch) {
    this.fetchImpl = fetchImpl;
  }

  async request(input: Parameters<WebsubHubClient["request"]>[0]) {
    const body = new URLSearchParams({
      "hub.callback": input.callbackUrl,
      "hub.mode": input.mode,
      "hub.topic": input.topicUrl,
      "hub.verify": "async",
      "hub.secret": input.hubSecret,
    });
    const response = await this.fetchImpl(YOUTUBE_WEBSUB_HUB_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`WebSub hub request failed with status ${response.status}`);
    }
  }
}
