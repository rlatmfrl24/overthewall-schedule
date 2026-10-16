import { useContext, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isSiteContentPath, siteContentQueryKey } from "@contracts/site-public-content";
import { CONTENT_READ_QUERY_OPTIONS, currentContentQuery } from "@/shared/query/content-read-policy";
import { readDocumentBootstrap, releaseDocumentBootstrap } from "./bootstrap";
import { useSiteSeo } from "@/shared/seo/use-site-seo";
import { fetchSiteContent } from "../api/site-content";
import { SiteContentSelectedDateContext } from "./date-context";

// The server's readable fallback is replaced by the existing app at startup.
// Keep public metadata fresh without adding a second content surface to the UI.
export function SiteContentMetadata({ path }: { path: string }) {
  const selectedDate = useContext(SiteContentSelectedDateContext);
  const date = path === '/' || path === '/weekly' ? selectedDate : undefined;
  return <CurrentSiteContentMetadata key={`${path}:${date ?? ""}`} path={path} date={date} />;
}

function CurrentSiteContentMetadata({ path, date }: { path: string; date?: string }) {
  const client = useQueryClient();
  const [bootstrap] = useState(() => readDocumentBootstrap(client, path, date));
  useEffect(() => { releaseDocumentBootstrap(client); }, [client]);
  const enabled = isSiteContentPath(path);
  const query = useQuery({
    queryKey: siteContentQueryKey(path, date), queryFn: () => fetchSiteContent(path, date), enabled,
    ...CONTENT_READ_QUERY_OPTIONS,
    refetchInterval: query => query.state.status === "error" ? 60_000 : query.state.data ? Math.max(1000, Math.min(300_000, Date.parse(query.state.data.expiresAt) - Date.now())) : false,
    retry: false,
  });
  const content = enabled && !query.isError ? currentContentQuery(query).data ?? (!query.isFetchedAfterMount ? bootstrap : undefined) : undefined;
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
