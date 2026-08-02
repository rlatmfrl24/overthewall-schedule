// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { buildFeedSiteSeo, buildProfileSiteSeo } from "@contracts/site-seo";
import { applySiteSeo } from "./apply-site-seo";

describe("applySiteSeo", () => {
  beforeEach(() => {
    document.head.innerHTML = '<meta data-site-seo="description" name="description"><meta data-site-seo="description" name="description">';
  });

  it("updates navigation metadata without creating new duplicates", () => {
    applySiteSeo(buildFeedSiteSeo(true));
    applySiteSeo(
      buildProfileSiteSeo({
        code: "member",
        name: "멤버",
        introduction: "소개",
        profileImages: [],
      }),
    );
    expect(document.title).toBe("멤버 프로필 | 오버더월");
    expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.querySelectorAll('meta[data-site-seo="robots"]')).toHaveLength(1);
    expect(document.querySelector('meta[data-site-seo="robots"]')?.getAttribute("content")).toBe("index,follow");
  });
});
