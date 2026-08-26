import {
  WebsubHubRequestError,
  type WebsubHubClient,
} from "../application/ports/websub-repository";

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
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchImpl(YOUTUBE_WEBSUB_HUB_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body,
          redirect: "manual",
          signal: AbortSignal.timeout(10_000),
        });
      } catch (error) {
        const code = error instanceof Error &&
            (error.name === "AbortError" || error.name === "TimeoutError")
          ? "hub_timeout"
          : "hub_network";
        if (attempt === 0) continue;
        throw new WebsubHubRequestError(code);
      }
      if (response.ok) return;
      const retryable = response.status === 408 || response.status === 429 ||
        response.status >= 500;
      if (retryable && attempt === 0) continue;
      throw new WebsubHubRequestError(`hub_http_${response.status}`);
    }
  }
}
