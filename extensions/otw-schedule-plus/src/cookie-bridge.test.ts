import { describe, expect, it, vi } from "vitest";
import {
  buildPartitionedLoginCookieDetails,
  expandLikelyPartitionKeys,
  getChatFramePartitionKeys,
  isNaverLoginCookieName,
  syncNaverLoginCookiesToPartitions,
} from "./cookie-bridge";
import type { ChromeApi, ChromeCookie } from "./chrome-api";
import type { RegisteredChzzkFrame } from "./protocol";

const makeCookie = (name: string): ChromeCookie => ({
  domain: ".naver.com",
  expirationDate: 4_102_444_800,
  hostOnly: false,
  httpOnly: true,
  name,
  path: "/",
  sameSite: "unspecified",
  secure: true,
  session: false,
  value: `${name}-value`,
});

describe("cookie bridge", () => {
  it("tracks only the Naver login cookies used for CHZZK iframe login", () => {
    expect(isNaverLoginCookieName("NID_AUT")).toBe(true);
    expect(isNaverLoginCookieName("NID_SES")).toBe(true);
    expect(isNaverLoginCookieName("NNB")).toBe(false);
  });

  it("sets copied login cookies as SameSite=None partitioned cookies", () => {
    expect(
      buildPartitionedLoginCookieDetails(makeCookie("NID_AUT"), "https://nid.naver.com/nidlogin.login", {
        hasCrossSiteAncestor: true,
        topLevelSite: "https://otw-schedule.info",
      }),
    ).toMatchObject({
      domain: ".naver.com",
      httpOnly: true,
      name: "NID_AUT",
      partitionKey: {
        hasCrossSiteAncestor: true,
        topLevelSite: "https://otw-schedule.info",
      },
      sameSite: "no_restriction",
      secure: true,
      url: "https://nid.naver.com/nidlogin.login",
      value: "NID_AUT-value",
    });
  });

  it("prefers the exact Chrome partition key from chat frames", async () => {
    const getPartitionKey = vi.fn((_details, callback) => {
      callback({
        hasCrossSiteAncestor: true,
        topLevelSite: "https://otw-schedule.info",
      });
    });
    const chromeApi = {
      cookies: {
        getPartitionKey,
      },
    } as unknown as ChromeApi;
    const frames: RegisteredChzzkFrame[] = [
      {
        channelId: "29a1ed5c0829fa620fab900dba7e011b",
        frameId: 10,
        kind: "chat",
        lastSeenAt: Date.now(),
        tabId: 1,
        url: "https://chzzk.naver.com/live/29a1ed5c0829fa620fab900dba7e011b/chat",
      },
    ];

    await expect(
      getChatFramePartitionKeys({
        chromeApi,
        fallbackTopLevelSite: "http://127.0.0.1",
        frames,
        tabId: 1,
      }),
    ).resolves.toEqual([
      {
        hasCrossSiteAncestor: true,
        topLevelSite: "https://otw-schedule.info",
      },
    ]);
  });

  it("copies NID_AUT and NID_SES to every target partition", async () => {
    const set = vi.fn((_details, callback) => callback(makeCookie("NID_AUT")));
    const chromeApi = {
      cookies: {
        get: vi.fn((details, callback) => callback(makeCookie(details.name))),
        set,
      },
      runtime: {},
    } as unknown as ChromeApi;

    await expect(
      syncNaverLoginCookiesToPartitions({
        chromeApi,
        partitionKeys: [{ topLevelSite: "https://otw-schedule.info" }],
      }),
    ).resolves.toBe("enabled");

    expect(set).toHaveBeenCalledTimes(2);
    expect(set.mock.calls.map(([details]) => details.name)).toEqual([
      "NID_AUT",
      "NID_SES",
    ]);
  });

  it("expands fallback partition keys to include cross-site iframe variants", () => {
    expect(
      expandLikelyPartitionKeys([{ topLevelSite: "http://127.0.0.1" }]),
    ).toEqual([
      { topLevelSite: "http://127.0.0.1" },
      {
        hasCrossSiteAncestor: true,
        topLevelSite: "http://127.0.0.1",
      },
    ]);
  });
});
