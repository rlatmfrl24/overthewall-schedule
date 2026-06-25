import { getChromeLastErrorMessage, type ChromeApi } from "./chrome-api.js";

const LEGACY_CHAT_COOKIE_BLOCK_RULE_BASE_ID = 2_000_000;

export const getLegacyChatCookieBlockRuleId = (tabId: number) =>
  LEGACY_CHAT_COOKIE_BLOCK_RULE_BASE_ID + Math.max(0, tabId);

const updateSessionRules = (
  chromeApi: ChromeApi | undefined,
  options: {
    removeRuleIds: number[];
  },
) =>
  new Promise<boolean>((resolve) => {
    const update = chromeApi?.declarativeNetRequest?.updateSessionRules;
    if (!update) {
      resolve(true);
      return;
    }

    try {
      const maybePromise = update(options, () => {
        resolve(!getChromeLastErrorMessage());
      });

      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(
          () => resolve(true),
          () => resolve(false),
        );
      }
    } catch {
      resolve(false);
    }
  });

export const removeLegacyChatCookieBlockerForTab = async (
  chromeApi: ChromeApi | undefined,
  tabId?: number,
) => {
  if (typeof tabId !== "number") return true;

  return updateSessionRules(chromeApi, {
    removeRuleIds: [getLegacyChatCookieBlockRuleId(tabId)],
  });
};
