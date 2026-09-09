// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildPlayMemberSiteSeo, buildProfileSiteSeo, type SiteSeoMetadata } from "@contracts/site-seo";
import { SiteSeoProvider } from "./site-seo-provider";
import { useSiteSeo } from "./use-site-seo";

function Page({ metadata }: { metadata: SiteSeoMetadata | null }) { useSiteSeo(metadata); return null; }
afterEach(cleanup);

describe("SEO navigation", () => {
  it("replaces profile and member metadata on client navigation and clears old images", () => {
    const profile = buildProfileSiteSeo({ code: "Alpha", name: "알파", introduction: "  소개\n 문장 ", profileImages: [
      { id: 2, memberUid: 1, imageUrl: "/later.webp", alt: null, sortOrder: 2 },
      { id: 1, memberUid: 1, imageUrl: "/first.webp", alt: null, sortOrder: 0 },
    ] });
    expect(profile.image).toBe("https://otw-schedule.info/first.webp");
    expect(profile.description).toBe("소개 문장");
    const play = buildPlayMemberSiteSeo({ uid: 1, code: "Alpha", name: "알파", oshiMark: null, unitName: null, songCount: 3, performanceCount: 4, imageUrl: "/first.webp", pageEligible: true });
    const view = render(<SiteSeoProvider pathname="/profile/Alpha"><Page metadata={profile} /></SiteSeoProvider>);
    expect(document.title).toBe(profile.title);
    view.rerender(<SiteSeoProvider pathname="/play/members/Alpha"><Page metadata={play} /></SiteSeoProvider>);
    expect(document.title).toBe(play.title);
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(play.canonical);
    view.rerender(<SiteSeoProvider pathname="/profile/Alpha"><Page metadata={profile} /></SiteSeoProvider>);
    expect(document.title).toBe(profile.title);
    expect(document.querySelectorAll('meta[property="og:image"]')).toHaveLength(1);
    view.rerender(<SiteSeoProvider pathname="/play/members/Beta"><Page metadata={null} /></SiteSeoProvider>);
    expect(document.title).not.toContain("알파");
    expect(document.querySelectorAll('meta[property="og:image"]')).toHaveLength(0);
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe("noindex,nofollow");
  });
});
