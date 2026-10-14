import { afterEach, expect, it, vi } from "vitest";
import { getSiteDefinition } from "@contracts/site-definition";
import type { SitePublicContent } from "@contracts/site-public-content";
import { CloudflareSiteContentCache } from "./site-content-cache";

afterEach(() => vi.unstubAllGlobals());
it("isolates identical path/date summaries in the shared Cache API", async () => {
  const store = new Map<string, Response>();
  vi.stubGlobal("caches", { default: {
    put: async (key: string, response: Response) => { store.set(key, response.clone()); },
    match: async (key: string) => store.get(key)?.clone(),
  } });
  const otw = new CloudflareSiteContentCache(getSiteDefinition("otw"));
  const luvdia = new CloudflareSiteContentCache(getSiteDefinition("luvdia"));
  const content = { path: "/vods", date: "2026-10-14", expiresAt: new Date(Date.now() + 60000).toISOString(), sections: [] } as unknown as SitePublicContent;
  await otw.put(content);
  expect(await otw.get(content.path, "2026-10-14")).toEqual(content);
  expect(await luvdia.get(content.path, "2026-10-14")).toBeNull();
  await luvdia.put({ ...content, sections: [{ id: "luvdia", title: "LuvDia", status: "empty", updatedAt: null, items: [] }] });
  expect(store.size).toBe(2);
  expect(await otw.get(content.path, "2026-10-14")).toEqual(content);
});
