// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { resolveSiteSeo } from "@contracts/site-seo";
import { siteContentQueryKey, type SitePublicContent } from "@contracts/site-public-content";
import { SiteContentMetadata } from "./site-content-metadata";
import { SiteContentProvider } from "../ui/site-content-provider";
import { useSiteContentDate } from "./date-context";
import React, { useState } from "react";
import { fetchSiteContent } from "../api/site-content";
vi.mock("../api/site-content", () => ({ fetchSiteContent: vi.fn() }));
vi.mock("@/shared/seo/use-site-seo", () => ({ useSiteSeo: vi.fn() }));

const data = (path: string, title: string): SitePublicContent => ({ path, date: "2026-09-22", metadata: resolveSiteSeo(path), generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 300_000).toISOString(), sections: [{ id: "s", title, status: "available", updatedAt: null, items: [{ title: "항목" }] }], structuredData: { name: title } });
afterEach(() => { cleanup(); vi.clearAllMocks(); document.getElementById("site-content-jsonld")?.remove(); });

it("uses the delivered data and replaces JSON-LD without adding app UI", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(siteContentQueryKey("/"), data("/", "오늘 일정"));
  vi.mocked(fetchSiteContent).mockResolvedValue(data("/rights", "권리 안내"));
  const view = render(<QueryClientProvider client={client}><SiteContentMetadata path="/" /></QueryClientProvider>);
  expect(view.container.childElementCount).toBe(0);
  expect(document.getElementById("site-content-jsonld")?.textContent).toContain("오늘 일정");
  expect(fetchSiteContent).not.toHaveBeenCalled();
  view.rerender(<QueryClientProvider client={client}><SiteContentMetadata path="/rights" /></QueryClientProvider>);
  await waitFor(() => expect(document.getElementById("site-content-jsonld")?.textContent).toContain("권리 안내"));
  expect(view.container.childElementCount).toBe(0);
  expect(document.getElementById("site-content-jsonld")?.textContent).not.toContain("오늘 일정");
  view.rerender(<QueryClientProvider client={client}><SiteContentMetadata path="/multiview" /></QueryClientProvider>);
  expect(document.getElementById("site-content-jsonld")).toBeNull();
  client.clear();
});

it("follows the selected week and clears stale JSON-LD without replacing the UI on failure", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(fetchSiteContent).mockImplementation(async (_path, date) => {
    if (date === "2026-09-29") throw new Error("offline");
    return data("/weekly", "선택한 주 일정");
  });
  function Week() {
    const [date, setDate] = useState("2026-09-22");
    useSiteContentDate(date);
    return <button onClick={() => setDate("2026-09-29")}>다음 주</button>;
  }
  const view = render(<QueryClientProvider client={client}><SiteContentProvider><SiteContentMetadata path="/weekly" /><Week /></SiteContentProvider></QueryClientProvider>);
  await waitFor(() => expect(document.getElementById("site-content-jsonld")?.textContent).toContain("선택한 주 일정"));
  expect(view.container.textContent).toBe("다음 주");
  fireEvent.click(screen.getByText("다음 주"));
  await waitFor(() => expect(fetchSiteContent).toHaveBeenCalledWith("/weekly", "2026-09-29"));
  await waitFor(() => expect(document.getElementById("site-content-jsonld")).toBeNull());
  expect(view.container.textContent).toBe("다음 주");
  client.clear();
});
