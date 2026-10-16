// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { SITE_OPENS_AT } from "@contracts/site-publication";
import { SitePublicationBoundary } from "./site-publication-boundary";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@clerk/clerk-react", () => ({ useAuth: () => ({ isLoaded: true, sessionId: null }) }));
vi.mock("@/shared/api/client", () => ({ apiFetch: mocks.fetch }));
vi.mock("@/shared/config/site", () => ({ site: { id: "otw" } }));
vi.mock("@/app/layout/site-countdown", () => ({ SiteCountdown: () => <p>Countdown</p> }));
vi.stubGlobal("React", React);
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("hides an open tab at midnight, clears fresh content, then mounts observers that fetch the new policy", async () => {
  let elapsed = 0;
  let tick = () => {};
  vi.spyOn(performance, "now").mockImplementation(() => elapsed);
  vi.spyOn(window, "setInterval").mockImplementation(callback => { tick = callback as () => void; return 1 as unknown as ReturnType<typeof window.setInterval>; });
  vi.spyOn(window, "clearInterval").mockImplementation(() => {});
  mocks.fetch.mockImplementation(async () => ({ phase: "open", canPreview: false, opensAt: SITE_OPENS_AT,
    serverNow: new Date(Date.parse(SITE_OPENS_AT) - 1000 + elapsed).toISOString() }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["members"], ["bing_hayu"]);
  const fetchMembers = vi.fn(async () => ["other"]);
  function Members() {
    const query = useQuery({ queryKey: ["members"], queryFn: fetchMembers, staleTime: Infinity });
    return <div>{query.data?.join(",")}</div>;
  }
  render(<QueryClientProvider client={client}><SitePublicationBoundary><Members /></SitePublicationBoundary></QueryClientProvider>);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(screen.getByText("bing_hayu")).toBeTruthy();
  expect(fetchMembers).not.toHaveBeenCalled();
  elapsed = 1500;
  await act(async () => { tick(); await new Promise(resolve => setTimeout(resolve, 20)); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(screen.queryByText("bing_hayu")).toBeNull();
  expect(screen.getByText("other")).toBeTruthy();
  expect(fetchMembers).toHaveBeenCalledTimes(1);
  client.clear();
});
