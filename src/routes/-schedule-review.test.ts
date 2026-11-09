// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { validateConsoleSearch } from "@/shared/lib/admin-console-search";
import { Route as collection } from "./admin/collection";
import { Route as settings } from "./admin/settings";
import { Route as review } from "./admin/review";

vi.mock("@/app/admin/console-screen", () => ({ConsoleScreen:()=>null}));
async function navigate(url: string) {
  const root = createRootRoute();
  const routes = [["/admin/collection",collection],["/admin/settings",settings],["/admin/review",review]] as const;
  const history = createMemoryHistory({initialEntries:[url]});
  const router = createRouter({history, routeTree:root.addChildren([
    ...routes.map(([path, route]) => createRoute({getParentRoute:()=>root,path,validateSearch:validateConsoleSearch,beforeLoad:context=>route.options.beforeLoad?.(context as never)})),
    createRoute({getParentRoute:()=>root,path:"/admin/history",validateSearch:validateConsoleSearch}),
    createRoute({getParentRoute:()=>root,path:"/admin/otw-play",validateSearch:validateConsoleSearch}),
  ])});
  await router.load();
  return {router,history};
}

it.each(["/admin/collection?source=schedule", "/admin/settings?tab=settings"])("moves %s to unified review while preserving filters and anchors", async path => {
  const {router,history} = await navigate(`${path}&q=keep&selected=%227%22#auto-update-panel-settings`);
  expect(router.state.location.pathname).toBe("/admin/review");
  expect(router.state.location.search).toEqual({tab:"schedule",q:"keep",selected:"7"});
  expect(router.state.location.hash).toBe("auto-update-panel-settings");
  expect(history.length).toBe(1);
});

it("keeps ordinary collection and legacy run history links at their own destinations", async () => {
  const cafe = await navigate("/admin/collection?source=naver-cafe");
  expect(cafe.router.state.location.pathname).toBe("/admin/collection");
  const runs = await navigate("/admin/settings?tab=runs");
  expect(runs.router.state.location.pathname).toBe("/admin/history");
  expect(runs.router.state.location.search).toEqual({tab:"runs",source:"schedule_auto_update"});
});

it.each(["/admin/review?tab=rejections","/admin/settings?tab=rejections"])("folds %s into the candidate rejection tab without losing anchors or filters",async path=>{
  const {router} = await navigate(path+"&q=keep&category=duplicate#auto-update-panel-rejections");
  expect(router.state.location.pathname).toBe("/admin/review");
  expect(router.state.location.search).toEqual({tab:"schedule",state:"rejections",q:"keep",category:"duplicate"});
  expect(router.state.location.hash).toBe("auto-update-panel-rejections");
});
