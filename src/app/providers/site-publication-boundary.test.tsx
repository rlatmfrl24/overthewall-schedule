// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createTestQueryClient } from "@/test/query-client";
import { SITE_OPENS_AT } from "@contracts/site-publication";
import { SitePublicationBoundary } from "./site-publication-boundary";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@clerk/clerk-react", () => ({ useAuth: () => ({ isLoaded: true, sessionId: null }) }));
vi.mock("@/shared/api/client", () => ({ apiFetch: mocks.fetch }));
vi.mock("@/shared/config/site", () => ({ site: { id: "otw" } }));
vi.mock("@/app/layout/site-countdown", () => ({ SiteCountdown: () => <p>Countdown</p> }));
let client: ReturnType<typeof createTestQueryClient>;
beforeEach(() => { vi.stubGlobal("React", React); client = createTestQueryClient(); });
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("hides an open tab at midnight, clears fresh content, then mounts observers that fetch the new policy", async () => {
  let elapsed = 0;
  let tick = () => {};
  vi.spyOn(performance, "now").mockImplementation(() => elapsed);
  const setInterval = window.setInterval;
  vi.spyOn(window, "setInterval").mockImplementation((callback, delay, ...args) => {
    if (delay === 1000) { tick = callback as () => void; return -1 as unknown as ReturnType<typeof window.setInterval>; }
    return setInterval(callback, delay, ...args) as unknown as ReturnType<typeof window.setInterval>;
  });
  mocks.fetch.mockImplementation(async () => ({ phase: "open", canPreview: false, opensAt: SITE_OPENS_AT,
    serverNow: new Date(Date.parse(SITE_OPENS_AT) - 1000 + elapsed).toISOString() }));
  client.setQueryData(["members"], ["bing_hayu"]);
  const fetchMembers = vi.fn(async () => ["other"]);
  function Members() {
    const query = useQuery({ queryKey: ["members"], queryFn: fetchMembers, staleTime: Infinity });
    return <div>{query.data?.join(",")}</div>;
  }
  render(<QueryClientProvider client={client}><SitePublicationBoundary><Members /></SitePublicationBoundary></QueryClientProvider>);
  expect(await screen.findByText("bing_hayu")).toBeTruthy();
  expect(fetchMembers).not.toHaveBeenCalled();
  elapsed = 1500;
  await act(async () => { tick(); });
  expect(await screen.findByText("other")).toBeTruthy();
  expect(screen.queryByText("bing_hayu")).toBeNull();
  expect(fetchMembers).toHaveBeenCalledTimes(1);
});
