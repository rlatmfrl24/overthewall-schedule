import { describe, expect, it } from "vitest";
import {
  decodePublicCatalogGroupKey,
  encodePublicCatalogGroupKey,
  PublicCatalogGroupKeyError,
} from "./public-group-key";
import {
  decodeUtf8Base64Url,
  encodeUtf8Base64Url,
} from "./utf8-base64url";

describe("OTW Play public group key", () => {
  it("round-trips a Unicode unit selector", () => {
    const selector = {
      entityId: null,
      unitName: "오버 더 월・一期生",
    };
    const key = encodePublicCatalogGroupKey(selector);

    expect(key).toMatch(/^g1_[A-Za-z0-9_-]+$/);
    expect(key).not.toContain(selector.unitName);
    expect(JSON.parse(decodeUtf8Base64Url(key.slice(3)))).toEqual({
      v: 1,
      k: "unit",
      i: selector.unitName,
    });
    expect(decodePublicCatalogGroupKey(key)).toEqual(selector);
    expect(encodePublicCatalogGroupKey(selector)).toBe(key);
  });

  it.each([
    { entityId: "group-only", unitName: null },
    { entityId: null, unitName: "유닛만" },
  ])("supports either selector authority", (selector) => {
    expect(
      decodePublicCatalogGroupKey(encodePublicCatalogGroupKey(selector)),
    ).toEqual(selector);
  });

  it("rejects empty, padded, malformed, and future-version keys", () => {
    expect(() =>
      encodePublicCatalogGroupKey({ entityId: null, unitName: null }),
    ).toThrow(PublicCatalogGroupKeyError);
    expect(() =>
      encodePublicCatalogGroupKey({
        entityId: "group",
        unitName: "유닛",
      }),
    ).toThrowError(expect.objectContaining({ reason: "invalid_selector" }));
    expect(() =>
      encodePublicCatalogGroupKey({ entityId: " group ", unitName: null }),
    ).toThrow(PublicCatalogGroupKeyError);
    expect(() => decodePublicCatalogGroupKey("group-name")).toThrowError(
      expect.objectContaining({ reason: "malformed" }),
    );
    expect(() => decodePublicCatalogGroupKey("g2_aaaa")).toThrowError(
      expect.objectContaining({ reason: "unsupported_version" }),
    );
    expect(() => decodePublicCatalogGroupKey("g1_aaaa=")).toThrowError(
      expect.objectContaining({ reason: "malformed" }),
    );
    expect(() =>
      decodePublicCatalogGroupKey(
        `g1_${encodeUtf8Base64Url(
          JSON.stringify({ v: 1, k: "member", i: "group" }),
        )}`,
      ),
    ).toThrowError(expect.objectContaining({ reason: "malformed" }));
  });
});
