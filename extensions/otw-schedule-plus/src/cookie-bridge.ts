import {
  getChromeLastErrorMessage,
  type ChromeApi,
  type ChromeCookie,
  type ChromeCookieDetails,
  type ChromeCookiePartitionKey,
  type ChromeCookieSetDetails,
} from "./chrome-api.js";
import type { ChatLoginBridgeStatus, RegisteredChzzkFrame } from "./protocol.js";

export const NAVER_LOGIN_COOKIE_SPECS = [
  {
    name: "NID_AUT",
    url: "https://nid.naver.com/nidlogin.login",
  },
  {
    name: "NID_SES",
    url: "https://nid.naver.com/nidlogin.login",
  },
] as const;

export const isNaverLoginCookieName = (name: string) =>
  NAVER_LOGIN_COOKIE_SPECS.some((spec) => spec.name === name);

const getCookie = (chromeApi: ChromeApi, details: ChromeCookieDetails) =>
  new Promise<ChromeCookie | undefined>((resolve, reject) => {
    if (!chromeApi.cookies?.get) {
      reject(new Error("cookies_api_missing"));
      return;
    }

    chromeApi.cookies.get(details, (cookie) => {
      const error = getChromeLastErrorMessage();
      if (error) {
        reject(new Error(error));
        return;
      }
      resolve(cookie);
    });
  });

const setCookie = (chromeApi: ChromeApi, details: ChromeCookieSetDetails) =>
  new Promise<boolean>((resolve) => {
    if (!chromeApi.cookies?.set) {
      resolve(false);
      return;
    }

    chromeApi.cookies.set(details, (cookie) => {
      const error = getChromeLastErrorMessage();
      resolve(!error && Boolean(cookie));
    });
  });

export const getNaverLoginCookies = async (chromeApi: ChromeApi) => {
  const cookies = await Promise.all(
    NAVER_LOGIN_COOKIE_SPECS.map(async (spec) => {
      const cookie = await getCookie(chromeApi, {
        name: spec.name,
        url: spec.url,
      });

      return cookie ? { cookie, spec } : null;
    }),
  );

  return cookies.filter(
    (entry): entry is NonNullable<(typeof cookies)[number]> => entry !== null,
  );
};

export const buildPartitionedLoginCookieDetails = (
  cookie: ChromeCookie,
  url: string,
  partitionKey: ChromeCookiePartitionKey,
): ChromeCookieSetDetails => ({
  domain: cookie.hostOnly ? undefined : cookie.domain,
  expirationDate: cookie.session ? undefined : cookie.expirationDate,
  httpOnly: cookie.httpOnly,
  name: cookie.name,
  partitionKey,
  path: cookie.path?.startsWith("/") ? cookie.path : "/",
  sameSite: "no_restriction",
  secure: true,
  storeId: cookie.storeId,
  url,
  value: cookie.value,
});

const dedupePartitionKeys = (partitionKeys: ChromeCookiePartitionKey[]) => {
  const seen = new Set<string>();
  const nextKeys: ChromeCookiePartitionKey[] = [];

  partitionKeys.forEach((partitionKey) => {
    if (!partitionKey.topLevelSite) return;

    const key = JSON.stringify({
      hasCrossSiteAncestor: partitionKey.hasCrossSiteAncestor,
      topLevelSite: partitionKey.topLevelSite,
    });
    if (seen.has(key)) return;
    seen.add(key);
    nextKeys.push(partitionKey);
  });

  return nextKeys;
};

export const expandLikelyPartitionKeys = (
  partitionKeys: ChromeCookiePartitionKey[],
) => {
  const expandedKeys = partitionKeys.flatMap((partitionKey) => {
    if (!partitionKey.topLevelSite) return [];
    return [
      partitionKey,
      {
        ...partitionKey,
        hasCrossSiteAncestor: true,
      },
    ];
  });

  return dedupePartitionKeys(expandedKeys);
};

const getFramePartitionKey = (
  chromeApi: ChromeApi,
  frame: RegisteredChzzkFrame,
) =>
  new Promise<ChromeCookiePartitionKey | null>((resolve) => {
    const getPartitionKey = chromeApi.cookies?.getPartitionKey;
    if (!getPartitionKey) {
      resolve(null);
      return;
    }

    try {
      const maybePromise = getPartitionKey(
        { frameId: frame.frameId, tabId: frame.tabId },
        (partitionKey) => {
          const error = getChromeLastErrorMessage();
          resolve(error ? null : partitionKey ?? null);
        },
      );

      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then((partitionKey) => {
          resolve(partitionKey ?? null);
        }, () => resolve(null));
      }
    } catch {
      resolve(null);
    }
  });

export const getChatFramePartitionKeys = async ({
  chromeApi,
  fallbackTopLevelSite,
  frames,
  tabId,
}: {
  chromeApi: ChromeApi;
  fallbackTopLevelSite: string | null;
  frames: RegisteredChzzkFrame[];
  tabId?: number;
}) => {
  const chatFrames = frames.filter(
    (frame) =>
      frame.kind === "chat" && (typeof tabId !== "number" || frame.tabId === tabId),
  );
  const framePartitionKeys = (
    await Promise.all(
      chatFrames.map((frame) => getFramePartitionKey(chromeApi, frame)),
    )
  ).filter((partitionKey): partitionKey is ChromeCookiePartitionKey =>
    Boolean(partitionKey?.topLevelSite),
  );

  if (framePartitionKeys.length > 0) {
    return dedupePartitionKeys(framePartitionKeys);
  }

  return fallbackTopLevelSite ? [{ topLevelSite: fallbackTopLevelSite }] : [];
};

export const syncNaverLoginCookiesToPartitions = async ({
  chromeApi,
  partitionKeys,
}: {
  chromeApi: ChromeApi;
  partitionKeys: ChromeCookiePartitionKey[];
}): Promise<ChatLoginBridgeStatus> => {
  if (!chromeApi.cookies) return "permission_missing";
  if (partitionKeys.length === 0) return "unsupported";

  try {
    const loginCookies = await getNaverLoginCookies(chromeApi);
    if (loginCookies.length === 0) return "needs_login";

    const results = await Promise.all(
      partitionKeys.flatMap((partitionKey) =>
        loginCookies.map(({ cookie, spec }) =>
          setCookie(
            chromeApi,
            buildPartitionedLoginCookieDetails(cookie, spec.url, partitionKey),
          ),
        ),
      ),
    );

    return results.some(Boolean) ? "enabled" : "unsupported";
  } catch {
    return "error";
  }
};
