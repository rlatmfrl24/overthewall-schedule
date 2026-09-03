export class YouTubeShortsUnavailableError extends Error {
  readonly retryAfterSeconds: number;

  constructor(
    message = "YouTube Shorts are temporarily unavailable",
    retryAfterSeconds = 15,
  ) {
    super(message);
    this.name = "YouTubeShortsUnavailableError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
