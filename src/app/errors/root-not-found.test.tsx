// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { RootNotFound } from "./root-not-found";

afterEach(cleanup);

it("중첩 경로의 404에서도 공통 안내와 홈 복귀를 제공한다", async () => {
  const root = createRootRoute({ component: Outlet });
  const home = createRoute({ getParentRoute: () => root, path: "/", component: () => <h1>오늘의 스케쥴</h1> });
  const play = createRoute({ getParentRoute: () => root, path: "play", component: Outlet });
  const songs = createRoute({ getParentRoute: () => play, path: "songs", component: () => <h1>곡 검색</h1> });
  const router = createRouter({ routeTree: root.addChildren([home, play.addChildren([songs])]),
    defaultNotFoundComponent: RootNotFound, history: createMemoryHistory({ initialEntries: ["/play/missing"] }) });
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "페이지를 찾을 수 없습니다" });
  fireEvent.click(screen.getByRole("link", { name: "홈으로 이동" }));
  await screen.findByRole("heading", { name: "오늘의 스케쥴" });
  expect(router.state.location.pathname).toBe("/");
});
