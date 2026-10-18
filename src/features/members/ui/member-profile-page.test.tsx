// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import React from "react";
import type { MemberProfileDto } from "@contracts/members";
import { createMemberFixture } from "@/test/member-fixtures";
import { ContentSessionContext } from "@/shared/hooks/content-session";
import { MemberProfilePage } from "./member-profile-page";

const profileQuery = vi.hoisted(() => vi.fn());
vi.mock("../queries/use-member-profile", () => ({ useMemberProfile: profileQuery }));
vi.mock("@/shared/seo", () => ({ useSiteSeo: vi.fn() }));
vi.mock("@/shared/ui/animation-provider", () => ({ useAnimations: () => ({ enabled: false }) }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));

const profile: MemberProfileDto = {
  ...createMemberFixture({ code: "member", name: "테스트 멤버" }),
  profileImages: [{ id: 1, memberUid: 1, imageUrl: "/profile/member.webp", alt: "프로필 사진", sortOrder: 0 }],
  backgroundImages: [{ id: "first", sortOrder: 0, version: "1" }, { id: "second", sortOrder: 1, version: "1" }],
  links: [],
};

class PreloadedImage {
  static instances: PreloadedImage[] = [];
  src = "";
  srcset = "";
  sizes = "";
  decoding = "";
  fetchPriority = "auto";
  complete = false;
  naturalWidth = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decode = async () => undefined;
  constructor() { PreloadedImage.instances.push(this); }
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  profileQuery.mockReturnValue({ data: profile, isLoading: false, isError: false, error: null });
  PreloadedImage.instances = [];
  vi.stubGlobal("Image", PreloadedImage);
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(min-width: 640px)", addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  Object.assign(window, { Clerk: { session: { getToken: async () => "own-token" } } });
  let counter = 0;
  URL.createObjectURL = () => `blob:profile-${++counter}`;
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("reserves the mobile portrait while protected bytes load and avoids hidden desktop background requests", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  let finish: ((response: Response) => void) | undefined;
  const fetcher = vi.fn<typeof fetch>(async (_path, init) => {
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer own-token");
    return new Promise<Response>(resolve => { finish = resolve; });
  });
  vi.stubGlobal("fetch", fetcher);
  const view = render(<ContentSessionContext.Provider value="own"><MemberProfilePage code="member" /></ContentSessionContext.Provider>);
  expect(view.getByRole("heading", { name: "테스트 멤버" })).toBeTruthy();
  expect(view.getByRole("img", { name: "프로필 사진 이미지 불러오는 중" }).getAttribute("aria-busy")).toBe("true");
  expect(view.getByAltText("프로필 사진").getAttribute("src")).toBeNull();
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  expect(fetcher.mock.calls[0][0]).toBe("/profile/member.webp");
  await act(async () => finish!(new Response(new Uint8Array([1]))));
  fireEvent.load(view.getByAltText("프로필 사진"));
  expect(view.getByAltText("프로필 사진").getAttribute("src")).toBe("blob:profile-1");
  expect(view.queryByRole("img", { name: /불러오는 중/ })).toBeNull();
});

it("loads optimized backgrounds first and requests their originals only after an authenticated failure", async () => {
  const blobs: Blob[] = [];
  URL.createObjectURL = blob => { if (!(blob instanceof Blob)) throw new Error("Expected Blob"); blobs.push(blob); return `blob:fallback-${blobs.length}`; };
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer own-token");
    expect(String(input)).toContain("archive=1");
    if (String(input).includes("/first/w1280.webp")) return new Response("Missing", { status: 404 });
    return new Response(String(input));
  });
  vi.stubGlobal("fetch", fetcher);
  const view = render(<ContentSessionContext.Provider value="own"><MemberProfilePage code="member" includeArchived /></ContentSessionContext.Provider>);
  await waitFor(() => expect(fetcher.mock.calls.some(([input]) => String(input).includes("/first/original.webp"))).toBe(true));
  expect(fetcher.mock.calls.some(([input]) => String(input).includes("/second/original.webp"))).toBe(false);
  expect(fetcher.mock.calls.some(([input]) => String(input).includes("/second/w1280.webp"))).toBe(true);
  expect(fetcher.mock.calls.some(([input]) => String(input).includes("/profile/signatures/member.png"))).toBe(true);
  await waitFor(() => expect(PreloadedImage.instances.filter(image => image.onload && image.fetchPriority !== "auto")).toHaveLength(2));
  const original = (await Promise.all(blobs.map(blob => blob.text()))).findIndex(path => path.includes("/first/original.webp"));
  expect(original).toBeGreaterThanOrEqual(0);
  await act(async () => { PreloadedImage.instances.filter(image => image.fetchPriority !== "auto").forEach(image => image.onload?.()); });
  await waitFor(() => expect(view.container.querySelector('[data-profile-background-load-key^="first:"]')?.getAttribute("src")).toBe(`blob:fallback-${original + 1}`));
});

it("does not fetch hidden primary portraits or full originals after successful authenticated background loads", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(new Uint8Array([1])));
  vi.stubGlobal("fetch", fetcher);
  render(<ContentSessionContext.Provider value="own"><MemberProfilePage code="member" /></ContentSessionContext.Provider>);
  await waitFor(() => expect(PreloadedImage.instances.filter(image => image.onload && image.fetchPriority !== "auto")).toHaveLength(2));
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(fetcher.mock.calls.map(([input]) => String(input)).sort()).toEqual([
    "/profile/signatures/member.png",
    "/r2-assets/members/member/backgrounds/first/w1280.webp?v=1",
    "/r2-assets/members/member/backgrounds/second/w1280.webp?v=1",
  ]);
});

it("falls back to the protected portrait after both background variants fail and stops loading after rejection", async () => {
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer own-token");
    expect(String(input)).toContain("archive=1");
    return new Response("Forbidden", { status: 403 });
  });
  vi.stubGlobal("fetch", fetcher);
  const view = render(<ContentSessionContext.Provider value="own"><MemberProfilePage code="member" includeArchived /></ContentSessionContext.Provider>);
  await waitFor(() => expect(view.getByRole("img", { name: "프로필 사진 이미지를 불러올 수 없습니다" })).toBeTruthy());
  expect(view.queryByRole("img", { name: /불러오는 중/ })).toBeNull();
  expect(view.getByAltText("프로필 사진").getAttribute("src")).toBeNull();
  expect(fetcher.mock.calls.some(([input]) => String(input).includes("/first/original.webp"))).toBe(true);
  expect(fetcher.mock.calls.some(([input]) => String(input).includes("/profile/member.webp?archive=1"))).toBe(true);
});

it("prioritizes the first desktop background and keeps carousel images available at low priority", async () => {
  const view = render(<MemberProfilePage code="member" />);
  const backgrounds = () => PreloadedImage.instances.filter(image => image.src.includes("/backgrounds/"));
  await waitFor(() => expect(backgrounds()).toHaveLength(2));
  expect(backgrounds().map(image => image.fetchPriority)).toEqual(["high", "low"]);
  await act(async () => { backgrounds().forEach(image => image.onload?.()); });
  await waitFor(() => expect(view.container.querySelector('[data-profile-background-index="0"]')).toBeTruthy());
  expect(view.getByRole("button", { name: "다음 배경 이미지" })).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "다음 배경 이미지" }));
  await waitFor(() => expect(view.container.querySelector('[data-profile-background-index="1"]')).toBeTruthy());
});
