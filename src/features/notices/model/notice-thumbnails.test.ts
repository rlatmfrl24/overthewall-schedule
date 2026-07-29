import { describe, expect, it } from "vitest";
import {
  NOTICE_THUMBNAIL_ACCEPT,
  NOTICE_THUMBNAIL_ASSET_PREFIX,
  NOTICE_THUMBNAIL_MAX_BYTES,
  NOTICE_THUMBNAIL_PUBLIC_PREFIX,
  buildNoticeThumbnailAssetUrl,
  getNoticeThumbnailContentTypeFromKey,
  getNoticeThumbnailExtension,
  getOwnedNoticeThumbnailKey,
  isAcceptedNoticeThumbnailType,
  isNoticeThumbnailAssetKey,
} from "./notice-thumbnails";

describe("notice thumbnail policy", () => {
  it("허용 MIME type과 업로드 제한을 일관되게 노출한다", () => {
    expect(NOTICE_THUMBNAIL_ACCEPT).toBe(
      "image/webp,image/png,image/jpeg",
    );
    expect(NOTICE_THUMBNAIL_MAX_BYTES).toBe(2 * 1024 * 1024);

    expect(isAcceptedNoticeThumbnailType("image/webp")).toBe(true);
    expect(isAcceptedNoticeThumbnailType("image/png")).toBe(true);
    expect(isAcceptedNoticeThumbnailType("image/jpeg")).toBe(true);
    expect(isAcceptedNoticeThumbnailType("image/gif")).toBe(false);
    expect(isAcceptedNoticeThumbnailType(null)).toBe(false);
  });

  it("MIME type을 canonical 확장자로 변환한다", () => {
    expect(getNoticeThumbnailExtension("image/webp")).toBe("webp");
    expect(getNoticeThumbnailExtension("image/png")).toBe("png");
    expect(getNoticeThumbnailExtension("image/jpeg")).toBe("jpg");
    expect(getNoticeThumbnailExtension("image/gif")).toBeNull();
    expect(getNoticeThumbnailExtension(undefined)).toBeNull();
  });

  it.each([
    ["notices/thumbnails/notice-1.webp", true],
    ["notices/thumbnails/NOTICE_2.PNG", true],
    ["notices/thumbnails/photo.jpeg", true],
    ["notices/thumbnails/photo.jpg", true],
    ["notices/thumbnails/.hidden.png", false],
    ["notices/thumbnails/nested/photo.png", false],
    ["notices/thumbnails/photo.gif", false],
    ["../notices/thumbnails/photo.png", false],
  ])("asset key %s 유효성은 %s이다", (key, expected) => {
    expect(isNoticeThumbnailAssetKey(key)).toBe(expected);
  });

  it("asset key 확장자에서 응답 Content-Type을 결정한다", () => {
    expect(
      getNoticeThumbnailContentTypeFromKey(
        "notices/thumbnails/notice.webp",
      ),
    ).toBe("image/webp");
    expect(
      getNoticeThumbnailContentTypeFromKey(
        "notices/thumbnails/notice.PNG",
      ),
    ).toBe("image/png");
    expect(
      getNoticeThumbnailContentTypeFromKey(
        "notices/thumbnails/notice.jpg",
      ),
    ).toBe("image/jpeg");
    expect(
      getNoticeThumbnailContentTypeFromKey(
        "notices/thumbnails/notice.jpeg",
      ),
    ).toBe("image/jpeg");
    expect(
      getNoticeThumbnailContentTypeFromKey(
        "notices/thumbnails/notice.gif",
      ),
    ).toBeNull();
  });

  it("asset key로 Worker 공개 URL을 만든다", () => {
    expect(
      buildNoticeThumbnailAssetUrl("notices/thumbnails/notice.png"),
    ).toBe("/r2-assets/notices/thumbnails/notice.png");
    expect(NOTICE_THUMBNAIL_PUBLIC_PREFIX).toBe(
      `${NOTICE_THUMBNAIL_ASSET_PREFIX}notices/thumbnails/`,
    );
  });

  it("소유한 공개 URL에서 query와 hash를 제외한 key를 복원한다", () => {
    expect(
      getOwnedNoticeThumbnailKey(
        "  /r2-assets/notices/thumbnails/notice-1.png?v=2#preview  ",
      ),
    ).toBe("notices/thumbnails/notice-1.png");
    expect(
      getOwnedNoticeThumbnailKey(
        "/r2-assets/notices/thumbnails/no%74ice_2.jpeg",
      ),
    ).toBe("notices/thumbnails/notice_2.jpeg");
  });

  it.each([
    undefined,
    null,
    "",
    "https://assets.example.com/r2-assets/notices/thumbnails/notice.png",
    "/r2-assets/notices/thumbnails/nested%2Fnotice.png",
    "/r2-assets/notices/thumbnails/notice.gif",
    "/r2-assets/notices/thumbnails/%E0%A4%A",
  ])("외부 또는 잘못 인코딩된 URL %s은 소유 key가 아니다", (value) => {
    expect(getOwnedNoticeThumbnailKey(value)).toBeNull();
  });
});
