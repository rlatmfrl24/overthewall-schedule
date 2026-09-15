// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { ApiError } from "@/shared/api/client";
import { validateOtwPlayCatalogRouteSearch } from "@/features/otw-play/model/catalog-route-search";
import { Route } from "@/routes/play/_catalog/members/$memberCode";

const { fetchMemberProfile } = vi.hoisted(() => ({ fetchMemberProfile: vi.fn() }));
vi.mock("@/features/members", () => ({ fetchMemberProfile }));

function setup(code = "ALPHA/") {
  const root = createRootRoute();
  const member = createRoute({
    getParentRoute: () => root,
    path: "/play/members/$memberCode",
    beforeLoad: context => Route.options.beforeLoad!({ ...context, params: { memberCode: context.params.memberCode } } as never),
  });
  const songs = createRoute({ getParentRoute: () => root, path: "/play/songs", validateSearch: validateOtwPlayCatalogRouteSearch });
  const history = createMemoryHistory({ initialEntries: [`/play/members/${code}?q=old&cursor=old&member=%222%22`] });
  const router = createRouter({ routeTree: root.addChildren([member, songs]), history });
  return { router, history };
}

describe("legacy member client navigation", () => {
  beforeEach(() => vi.resetAllMocks());
  it("replaces the old URL and applies a string member filter without old search values", async () => {
    fetchMemberProfile.mockResolvedValue({ uid: 1 });
    const { router, history } = setup();
    await router.load();
    expect(history.location.href).toBe("/play/songs?member=%221%22");
    expect(history.length).toBe(1);
    expect(router.state.location.search).toEqual({ member: "1" });
    expect(fetchMemberProfile).toHaveBeenCalledWith("ALPHA");
  });
  it("shows not-found for unknown or inactive members", async () => {
    fetchMemberProfile.mockRejectedValue(new ApiError("missing", 404));
    const { router } = setup("missing");
    await router.load();
    expect(router.state.matches.some(match => match.status === "notFound")).toBe(true);
  });
  it("can retry a failed profile lookup", async () => {
    fetchMemberProfile.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ uid: 8 });
    const { router, history } = setup();
    await router.load();
    expect(router.state.matches.some(match => match.status === "error")).toBe(true);
    await router.invalidate();
    expect(history.location.href).toBe("/play/songs?member=%228%22");
  });
});
