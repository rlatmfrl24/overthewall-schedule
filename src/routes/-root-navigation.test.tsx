// @vitest-environment jsdom
import React, { useState, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Link, Outlet, RouterProvider } from "@tanstack/react-router";
import { afterEach, expect, it, vi } from "vitest";
import { resolveSiteSeo } from "@contracts/site-seo";
import { useSiteContentDate } from "@/features/site-content";
import { fetchSiteContent } from "@/features/site-content/api/site-content";
import { Route } from "./__root";

vi.mock("@/app/layout", () => ({
  getAppChromeMode: () => "public",
  PublicAppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/app/layout/footer", () => ({ Footer: () => null }));
vi.mock("@/features/site-content/api/site-content", () => ({ fetchSiteContent: vi.fn() }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function PersistentLayout() {
  const [count, setCount] = useState(0);
  return <>
    <button onClick={() => setCount(count + 1)}>Queue {count}</button>
    <iframe title="Persistent player host" src="about:blank" />
    <Link to="/play">Discover</Link>
    <Link to="/play/clips">Clips</Link>
    <Link to="/play/playlists">Playlists</Link>
    <Outlet />
  </>;
}

function Schedule({ date }: { date: string }) {
  useSiteContentDate(date);
  return <h1>Schedule</h1>;
}

function renderApp(initialPath = "/play") {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.mocked(fetchSiteContent).mockImplementation(async path => ({
    path, date: "2026-09-29", metadata: resolveSiteSeo(path),
    generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 300_000).toISOString(),
    sections: [], structuredData: { name: path },
  }));
  const root = createRootRoute({ component: Route.options.component });
  const play = createRoute({ getParentRoute: () => root, path: "play", component: PersistentLayout });
  const pages = ["/", "clips", "playlists"].map(path => createRoute({
    getParentRoute: () => play, path, component: () => <h1>{path}</h1>,
  }));
  const weekly = createRoute({ getParentRoute: () => root, path: "weekly", component: () => <Schedule date="2026-09-22" /> });
  const daily = createRoute({ getParentRoute: () => root, path: "/", component: () => <Schedule date="2026-09-29" /> });
  const router = createRouter({
    routeTree: root.addChildren([play.addChildren(pages), weekly, daily]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return { router, dispose: () => { view.unmount(); client.clear(); } };
}

it("preserves the common layout and iframe across Play tabs while updating route metadata", async () => {
  const app = renderApp();
  try {
    fireEvent.click(await screen.findByRole("button", { name: "Queue 0" }));
    const host = screen.getByTitle("Persistent player host");
    for (const [tab, path] of [["Clips", "clips"], ["Playlists", "playlists"], ["Discover", "/"]]) {
      fireEvent.click(screen.getByRole("link", { name: tab }));
      await screen.findByRole("heading", { name: path });
      expect(screen.getByRole("button", { name: "Queue 1" })).toBeTruthy();
      expect(screen.getByTitle("Persistent player host")).toBe(host);
      expect(document.title).toBe(resolveSiteSeo(app.router.state.location.pathname).title);
    }
    await waitFor(() => expect(document.getElementById("site-content-jsonld")?.textContent).toBe(JSON.stringify({ name: "/play" })));
    await act(async () => { await app.router.navigate({ to: "/weekly" }); });
    expect(screen.queryByTitle("Persistent player host")).toBeNull();
  } finally { app.dispose(); }
});

it.each([
  ["/weekly", "/play", "2026-09-22", undefined],
  ["/weekly", "/", "2026-09-22", "2026-09-29"],
  ["/", "/play", "2026-09-29", undefined],
  ["/", "/weekly", "2026-09-29", "2026-09-22"],
] as const)("never requests %s -> %s with the previous schedule date", async (from, to, oldDate, newDate) => {
  const app = renderApp(from);
  try {
    await waitFor(() => expect(fetchSiteContent).toHaveBeenCalledWith(from, oldDate));
    vi.mocked(fetchSiteContent).mockClear();
    await act(async () => { await app.router.navigate({ to }); });
    await waitFor(() => expect(fetchSiteContent).toHaveBeenLastCalledWith(to, newDate));
    expect(fetchSiteContent).not.toHaveBeenCalledWith(to, oldDate);
    await waitFor(() => expect(document.getElementById("site-content-jsonld")?.textContent).toBe(JSON.stringify({ name: to })));
  } finally { app.dispose(); }
});
