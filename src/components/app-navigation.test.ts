import { describe, expect, it } from "vitest";
import {
  getAppChromeMode,
  getPublicNavigationSections,
  isNavItemActive,
  resolveMemberPostsNavState,
} from "./app-navigation";

describe("app navigation", () => {
  it("resolves app chrome modes by route family", () => {
    expect(getAppChromeMode("/")).toBe("public");
    expect(getAppChromeMode("/weekly")).toBe("public");
    expect(getAppChromeMode("/admin/notices")).toBe("admin");
    expect(getAppChromeMode("/multiview")).toBe("public");
    expect(getAppChromeMode("/snapshot")).toBe("none");
    expect(getAppChromeMode("/profile/yang_mei")).toBe("none");
  });

  it("shows member posts as locked when only members-only sources are enabled", () => {
    expect(
      resolveMemberPostsNavState({
        xVisibility: "members",
        cafeEnabled: true,
        cafeVisibility: "private",
      }),
    ).toEqual({ visible: true, requiresAuth: true });
  });

  it("shows member posts as normal when any source is public", () => {
    expect(
      resolveMemberPostsNavState({
        xVisibility: "members",
        cafeEnabled: true,
        cafeVisibility: "public",
      }),
    ).toEqual({ visible: true, requiresAuth: false });
  });

  it("hides member posts when all sources are private or disabled", () => {
    expect(
      resolveMemberPostsNavState({
        xVisibility: "private",
        cafeEnabled: false,
        cafeVisibility: "public",
      }),
    ).toEqual({ visible: false, requiresAuth: false });
  });

  it("adds admin navigation only for admins", () => {
    const regularSections = getPublicNavigationSections({
      isAdmin: false,
      memberPosts: { visible: false, requiresAuth: false },
    });
    const adminSections = getPublicNavigationSections({
      isAdmin: true,
      memberPosts: { visible: false, requiresAuth: false },
    });

    expect(regularSections.some((section) => section.id === "admin")).toBe(
      false,
    );
    expect(adminSections.some((section) => section.id === "admin")).toBe(true);
  });

  it("orders public sidebar sections and removes support links", () => {
    const sections = getPublicNavigationSections({
      isAdmin: true,
      memberPosts: { visible: true, requiresAuth: false },
    });
    const contentSection = sections.find((section) => section.id === "content");
    const adminItem = sections
      .flatMap((section) => section.items)
      .find((item) => item.id === "admin");

    expect(sections.map((section) => section.id)).toEqual([
      "schedule",
      "content",
      "external",
      "admin",
    ]);
    expect(contentSection?.items.map((item) => item.id)).toEqual([
      "notice",
      "vods",
      "feed",
      "multiview",
    ]);
    expect(adminItem?.to).toBe("/admin/notices");
  });

  it("matches nested route active states", () => {
    const sections = getPublicNavigationSections({
      isAdmin: true,
      memberPosts: { visible: true, requiresAuth: false },
    });
    const vodItem = sections
      .flatMap((section) => section.items)
      .find((item) => item.id === "vods");
    const dailyItem = sections
      .flatMap((section) => section.items)
      .find((item) => item.id === "daily");

    expect(vodItem).toBeDefined();
    expect(dailyItem).toBeDefined();
    expect(isNavItemActive("/vods", vodItem!)).toBe(true);
    expect(isNavItemActive("/vods/", vodItem!)).toBe(true);
    expect(isNavItemActive("/", dailyItem!)).toBe(true);
    expect(isNavItemActive("/weekly", dailyItem!)).toBe(false);
  });
});
