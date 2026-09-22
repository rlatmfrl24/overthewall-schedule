// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { buildProfileSiteSeo, resolveSiteSeo } from "@contracts/site-seo";
import { siteContentQueryKey, type SitePublicContent } from "@contracts/site-public-content";
import { SiteContentMetadata } from "./site-content-metadata";
import { fetchSiteContent } from "../api/site-content";
import { SiteSeoProvider } from "@/shared/seo/site-seo-provider";
import { useSiteSeo } from "@/shared/seo/use-site-seo";

vi.mock("../api/site-content", () => ({ fetchSiteContent: vi.fn() }));
const clients: QueryClient[] = [];
const createClient = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return client;
};
const data = (path: string): SitePublicContent => ({ path, date: null, metadata: resolveSiteSeo(path), generatedAt: new Date(Date.now() - 300_000).toISOString(), expiresAt: new Date(Date.now() - 1).toISOString(), sections: [], structuredData: { name: path } });
afterEach(() => {
  cleanup();
  clients.splice(0).forEach(client => client.clear());
  vi.useRealTimers();
  vi.clearAllMocks();
});

it("waits a minute after expired content fails, then resumes fresh polling after recovery", async () => {
  vi.useFakeTimers();
  const client = createClient();
  client.setQueryData(siteContentQueryKey("/"), data("/"), { updatedAt: Date.now() - 300_000 });
  vi.mocked(fetchSiteContent).mockRejectedValue(new Error("503"));
  render(<QueryClientProvider client={client}><SiteContentMetadata path="/" /></QueryClientProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(fetchSiteContent).toHaveBeenCalledTimes(1);
  expect(document.getElementById("site-content-jsonld")).toBeNull();
  vi.mocked(fetchSiteContent).mockImplementation(async () => ({ ...data("/"), generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 300_000).toISOString() }));
  await act(async () => { await vi.advanceTimersByTimeAsync(56_000); });
  expect(fetchSiteContent).toHaveBeenCalledTimes(2);
  expect(document.getElementById("site-content-jsonld")).not.toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(fetchSiteContent).toHaveBeenCalledTimes(2);
});

it("preserves the healthy profile metadata when only the AEO request fails", async () => {
  const client = createClient();
  const path = "/profile/member";
  const metadata = buildProfileSiteSeo({ code: "member", name: "멤버", introduction: "소개", profileImages: [] });
  client.setQueryData(siteContentQueryKey(path), { ...data(path), metadata, expiresAt: new Date(Date.now() + 300_000).toISOString() });
  vi.mocked(fetchSiteContent).mockRejectedValue(new Error("503"));
  function ExistingProfile() { useSiteSeo(metadata); return <p>정상 프로필</p>; }
  render(<QueryClientProvider client={client}><SiteSeoProvider pathname={path}><SiteContentMetadata path={path} /><ExistingProfile /></SiteSeoProvider></QueryClientProvider>);
  await waitFor(() => expect(document.title).toBe(metadata.title));
  await act(async () => { await client.invalidateQueries({ queryKey: siteContentQueryKey(path) }); });
  await waitFor(() => expect(document.getElementById("site-content-jsonld")).toBeNull());
  expect(document.title).toBe(metadata.title);
  expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("index,follow");
});
