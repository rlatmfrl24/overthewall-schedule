import { useContext, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { isSiteContentPath, siteContentQueryKey } from "@contracts/site-public-content";
import { useSiteSeo } from "@/shared/seo/use-site-seo";
import { fetchSiteContent } from "../api/site-content";
import { SiteContentSelectedDateContext } from "./date-context";

// The server's readable fallback is replaced by the existing app at startup.
// Keep public metadata fresh without adding a second content surface to the UI.
export function SiteContentMetadata({ path }: { path: string }) {
  const date = useContext(SiteContentSelectedDateContext);
  const enabled = isSiteContentPath(path);
  const query = useQuery({
    queryKey: siteContentQueryKey(path, date), queryFn: () => fetchSiteContent(path, date), enabled,
    staleTime: path === "/feed" || path.startsWith("/play") ? 0 : query => Math.max(0, Date.parse(query.state.data?.expiresAt ?? "") - Date.parse(query.state.data?.generatedAt ?? "")) || 0,
    refetchOnWindowFocus: true,
    refetchInterval: query => query.state.status === "error" ? 60_000 : query.state.data ? Math.max(1000, Math.min(300_000, Date.parse(query.state.data.expiresAt) - Date.now())) : false,
    retry: false,
  });
  const content = enabled && !query.isError ? query.data : undefined;
  useSiteSeo(content?.metadata ?? null, 1);
  useEffect(() => {
    document.getElementById("site-content-jsonld")?.remove();
    if (content?.structuredData) {
      const script = document.createElement("script");
      script.id = "site-content-jsonld"; script.type = "application/ld+json";
      script.textContent = JSON.stringify(content.structuredData);
      document.head.append(script);
    }
    return () => { document.getElementById("site-content-jsonld")?.remove(); };
  }, [content]);
  return null;
}
