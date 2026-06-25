export interface ChromeRuntimeLastError {
  message?: string;
}

export interface ChromeMessageSender {
  frameId?: number;
  origin?: string;
  tab?: {
    id?: number;
    url?: string;
  };
  url?: string;
}

export interface ChromeCookie {
  domain: string;
  expirationDate?: number;
  hostOnly?: boolean;
  httpOnly?: boolean;
  name: string;
  path: string;
  sameSite?: "no_restriction" | "lax" | "strict" | "unspecified";
  secure?: boolean;
  session?: boolean;
  storeId?: string;
  value: string;
}

export interface ChromeCookiePartitionKey {
  hasCrossSiteAncestor?: boolean;
  topLevelSite?: string;
}

export interface ChromeCookieDetails {
  name: string;
  partitionKey?: ChromeCookiePartitionKey;
  storeId?: string;
  url: string;
}

export interface ChromeCookieRemoveDetails {
  name: string;
  partitionKey?: ChromeCookiePartitionKey;
  storeId?: string;
  url: string;
}

export interface ChromePermissionsRequest {
  origins?: string[];
  permissions?: string[];
}

export type ChromeDeclarativeNetRequestResourceType =
  | "main_frame"
  | "sub_frame"
  | "stylesheet"
  | "script"
  | "image"
  | "font"
  | "object"
  | "xmlhttprequest"
  | "ping"
  | "csp_report"
  | "media"
  | "websocket"
  | "other";

export interface ChromeDeclarativeNetRequestRule {
  action: {
    requestHeaders?: Array<{
      header: string;
      operation: "remove" | "set" | "append";
      value?: string;
    }>;
    responseHeaders?: Array<{
      header: string;
      operation: "remove" | "set" | "append";
      value?: string;
    }>;
    type: "modifyHeaders";
  };
  condition: {
    resourceTypes?: ChromeDeclarativeNetRequestResourceType[];
    tabIds?: number[];
    urlFilter?: string;
  };
  id: number;
  priority?: number;
}

export interface ChromeCookieSetDetails {
  domain?: string;
  expirationDate?: number;
  httpOnly?: boolean;
  name: string;
  partitionKey?: ChromeCookiePartitionKey;
  path?: string;
  sameSite?: "no_restriction" | "lax" | "strict" | "unspecified";
  secure?: boolean;
  storeId?: string;
  url: string;
  value: string;
}

export interface ChromeApi {
  cookies?: {
    get: (
      details: ChromeCookieDetails,
      callback: (cookie?: ChromeCookie) => void,
    ) => void;
    getAll: (
      details: { domain?: string },
      callback: (cookies: ChromeCookie[]) => void,
    ) => void;
    getPartitionKey?: (
      details: { frameId?: number; tabId?: number },
      callback?: (partitionKey?: ChromeCookiePartitionKey) => void,
    ) => Promise<ChromeCookiePartitionKey | undefined> | void;
    onChanged?: {
      addListener: (
        listener: (changeInfo: {
          cookie: ChromeCookie;
          removed: boolean;
        }) => void,
      ) => void;
    };
    remove: (
      details: ChromeCookieRemoveDetails,
      callback: (details?: { name: string; storeId?: string; url: string }) => void,
    ) => void;
    set: (
      details: ChromeCookieSetDetails,
      callback: (cookie?: ChromeCookie) => void,
    ) => void;
  };
  declarativeNetRequest?: {
    updateSessionRules: (
      options: {
        addRules?: ChromeDeclarativeNetRequestRule[];
        removeRuleIds?: number[];
      },
      callback?: () => void,
    ) => Promise<void> | void;
  };
  permissions?: {
    contains: (
      request: ChromePermissionsRequest,
      callback: (granted: boolean) => void,
    ) => void;
    request: (
      request: ChromePermissionsRequest,
      callback: (granted: boolean) => void,
    ) => void;
  };
  runtime: {
    id: string;
    lastError?: ChromeRuntimeLastError;
    onMessage: {
      addListener: (
        listener: (
          message: unknown,
          sender: ChromeMessageSender,
          sendResponse: (response?: unknown) => void,
        ) => boolean | void,
      ) => void;
    };
    sendMessage: (
      message: unknown,
      callback?: (response?: unknown) => void,
    ) => void;
  };
  storage?: {
    local: {
      get: (
        keys: string | string[] | Record<string, unknown> | null,
        callback: (items: Record<string, unknown>) => void,
      ) => void;
      set: (
        items: Record<string, unknown>,
        callback?: () => void,
      ) => void;
    };
  };
  tabs?: {
    sendMessage: (
      tabId: number,
      message: unknown,
      options: { frameId?: number },
      callback: (response?: unknown) => void,
    ) => void;
  };
}

declare global {
  var chrome: ChromeApi | undefined;
}

export const getChromeApi = () => globalThis.chrome;

export const getChromeLastErrorMessage = () =>
  getChromeApi()?.runtime.lastError?.message;
