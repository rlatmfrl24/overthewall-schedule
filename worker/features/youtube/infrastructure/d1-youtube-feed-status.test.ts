import { describe, expect, it } from "vitest";
import { classifyYouTubeFeedState } from "./d1-youtube-feed-status";
describe("YouTube feed states", () => {
  const now = 1_000_000_000;
  const source = { enabled: 1, initialization_completed_at: 1, last_success_at: 1, next_check_at: now + 1, last_error_code: null };
  it("keeps failure, initialization, pause, due, 2h delay and unknown distinct", () => {
    expect(classifyYouTubeFeedState(source, true, false, now)).toBe("misconfigured");
    expect(classifyYouTubeFeedState({ ...source, last_error_code: "youtube_500" }, true, true, now)).toBe("failed");
    expect(classifyYouTubeFeedState(undefined, true, true, now)).toBe("initializing");
    expect(classifyYouTubeFeedState(source, false, true, now)).toBe("paused");
    expect(classifyYouTubeFeedState({ ...source, next_check_at: now }, true, true, now)).toBe("due");
    expect(classifyYouTubeFeedState({ ...source, next_check_at: now - 7_200_000 + 1 }, true, true, now)).toBe("due");
    expect(classifyYouTubeFeedState({ ...source, next_check_at: now - 7_200_000 }, true, true, now)).toBe("delayed");
    expect(classifyYouTubeFeedState(source, true, true, now)).toBe("healthy");
    expect(classifyYouTubeFeedState({ ...source, next_check_at: null }, true, true, now)).toBe("unknown");
  });
});
