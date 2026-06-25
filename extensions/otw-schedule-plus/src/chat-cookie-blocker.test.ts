import { describe, expect, it, vi } from "vitest";
import {
  getLegacyChatCookieBlockRuleId,
  removeLegacyChatCookieBlockerForTab,
} from "./chat-cookie-blocker";
import type { ChromeApi } from "./chrome-api";

describe("legacy chat cookie blocker cleanup", () => {
  it("removes the legacy tab-scoped block rule without adding a replacement", async () => {
    const updateSessionRules = vi.fn((_options, callback) => callback());
    const chromeApi = {
      declarativeNetRequest: { updateSessionRules },
      runtime: {},
    } as unknown as ChromeApi;

    await expect(
      removeLegacyChatCookieBlockerForTab(chromeApi, 12),
    ).resolves.toBe(true);
    expect(updateSessionRules).toHaveBeenCalledWith(
      {
        removeRuleIds: [getLegacyChatCookieBlockRuleId(12)],
      },
      expect.any(Function),
    );
  });

  it("treats cleanup as successful when DNR is unavailable", async () => {
    await expect(
      removeLegacyChatCookieBlockerForTab(undefined, 12),
    ).resolves.toBe(true);
  });
});
