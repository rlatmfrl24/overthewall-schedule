import type { QueryClient } from "@tanstack/react-query";
import { siteContentQueryKey, type SitePublicContent } from "@contracts/site-public-content";

const documentBootstraps = new WeakMap<QueryClient, SitePublicContent>();

export function readDocumentBootstrap(client: QueryClient, path: string, date?: string) {
  const content = documentBootstraps.get(client);
  return content?.path === path && window.location.pathname === path &&
    (!date || date === content.date) && Date.parse(content.expiresAt) > Date.now() ? content : undefined;
}
export function releaseDocumentBootstrap(client: QueryClient) {
  documentBootstraps.delete(client);
}

export function seedSiteContent(client: QueryClient) {
  const element = document.getElementById("site-content-data");
  if (!element?.textContent) return;
  try {
    const content = JSON.parse(element.textContent) as SitePublicContent;
    if (content.path !== window.location.pathname || !Array.isArray(content.sections) ||
        !Number.isFinite(Date.parse(content.generatedAt)) || !(Date.parse(content.expiresAt) > Date.now())) return;
    documentBootstraps.set(client, content);
    const options = { updatedAt: Date.parse(content.generatedAt) };
    client.setQueryData(siteContentQueryKey(content.path), content, options);
    if (content.date) client.setQueryData(siteContentQueryKey(content.path, content.date), content, options);
  } catch {
    // A missing or invalid seed must fall back to the normal public API read.
  } finally { element.remove(); }
}
