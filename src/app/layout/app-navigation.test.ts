import { describe, expect, it } from "vitest";
import {
  getAppChromeMode,
  getPublicNavigationSections,
  getPublicSidebarMode,
  isNavItemActive,
  resolveMemberPostsNavState,
} from "./app-navigation";

describe("app navigation", () => {
  it("resolves app chrome modes by route family", () => {
    expect(getAppChromeMode("/")).toBe("public");
    expect(getAppChromeMode("/weekly")).toBe("public");
    expect(getAppChromeMode("/multiview")).toBe("public");
    expect(getAppChromeMode("/admin/notices")).toBe("admin");
    expect(getAppChromeMode("/snapshot")).toBe("none");
    expect(getAppChromeMode("/profile/yang_mei")).toBe("none");
  });

  it("keeps the multiview sidebar compact across desktop widths", () => {
    expect(getPublicSidebarMode("/multiview")).toBe("compact");
    expect(getPublicSidebarMode("/multiview/")).toBe("compact");
    expect(getPublicSidebarMode("/multiview/embed")).toBe("compact");
    expect(getPublicSidebarMode("/")).toBe("responsive");
    expect(getPublicSidebarMode("/weekly")).toBe("responsive");
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
    expect(adminItem?.to).toBe("/admin/operations");
  });

  it("keeps multiview public even when member posts require auth", () => {
    const sections = getPublicNavigationSections({
      isAdmin: false,
      memberPosts: { visible: true, requiresAuth: true },
    });
    const contentItems =
      sections.find((section) => section.id === "content")?.items ?? [];
    const feedItem = contentItems.find((item) => item.id === "feed");
    const multiviewItem = contentItems.find((item) => item.id === "multiview");

    expect(contentItems.map((item) => item.id)).toEqual([
      "notice",
      "vods",
      "feed",
      "multiview",
    ]);
    expect(feedItem?.requiresAuth).toBe(true);
    expect(multiviewItem?.requiresAuth).toBeUndefined();
    expect(multiviewItem?.to).toBe("/multiview");
  });

  it("shows the catalog OTW Play entry only to admins when the navigation gate is open", () => {
    const hidden = getPublicNavigationSections({
      isAdmin: false,
      memberPosts: { visible: false, requiresAuth: false },
      otwPlayVisible: false,
    });
    const nonAdmin = getPublicNavigationSections({
      isAdmin: false,
      memberPosts: { visible: false, requiresAuth: false },
      otwPlayVisible: true,
    });
    const visible = getPublicNavigationSections({
      isAdmin: true,
      memberPosts: { visible: false, requiresAuth: false },
      otwPlayVisible: true,
    });
    expect(
      hidden.flatMap(({ items }) => items).some(({ id }) => id === "otw-play"),
    ).toBe(false);
    expect(
      nonAdmin.flatMap(({ items }) => items).some(({ id }) => id === "otw-play"),
    ).toBe(false);
    expect(
      visible.flatMap(({ items }) => items).find(({ id }) => id === "otw-play")?.to,
    ).toBe("/play");
  });

  it("uses one OTW Play entry for signed-in members and admins", () => {
    const signedOut = getPublicNavigationSections({
      isAdmin: false,
      isSignedIn: false,
      memberPosts: { visible: false, requiresAuth: false },
    });
    const member = getPublicNavigationSections({
      isAdmin: false,
      isSignedIn: true,
      memberPosts: { visible: false, requiresAuth: false },
    });
    const admin = getPublicNavigationSections({
      isAdmin: true,
      isSignedIn: true,
      memberPosts: { visible: false, requiresAuth: false },
      otwPlayVisible: true,
    });
    const items = (sections: typeof member) =>
      sections.flatMap((section) => section.items);

    expect(items(signedOut).some(({ id }) => id === "otw-play")).toBe(false);
    expect(items(member).find(({ id }) => id === "otw-play")).toMatchObject({
      label: "OTW Play",
      to: "/play/submit",
      requiresAuth: true,
    });
    expect(items(member).some(({ id }) => id === "otw-play-submit")).toBe(false);
    expect(items(admin).filter(({ id }) => id === "otw-play")).toHaveLength(1);
    expect(items(admin).some(({ id }) => id === "otw-play-submit")).toBe(false);
    expect(items(admin).find(({ id }) => id === "otw-play")?.to).toBe("/play");
  });

  it("keeps the unified OTW Play item active across proposal routes", () => {
    const member = getPublicNavigationSections({
      isAdmin: false,
      isSignedIn: true,
      memberPosts: { visible: false, requiresAuth: false },
    }).flatMap((section) => section.items).find(({ id }) => id === "otw-play");

    expect(member).toBeDefined();
    expect(isNavItemActive("/play/submit", member!)).toBe(true);
    expect(isNavItemActive("/play/submissions", member!)).toBe(true);
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
    const multiviewItem = sections
      .flatMap((section) => section.items)
      .find((item) => item.id === "multiview");

    expect(vodItem).toBeDefined();
    expect(dailyItem).toBeDefined();
    expect(multiviewItem).toBeDefined();
    expect(isNavItemActive("/vods", vodItem!)).toBe(true);
    expect(isNavItemActive("/vods/", vodItem!)).toBe(true);
    expect(isNavItemActive("/multiview", multiviewItem!)).toBe(true);
    expect(isNavItemActive("/", dailyItem!)).toBe(true);
    expect(isNavItemActive("/weekly", dailyItem!)).toBe(false);
  });
});
