import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import type { SitePublicContent } from "@contracts/site-public-content";
import { apiFetch } from "@/shared/api/client";
export const fetchSiteContent = (path: string, date?: string) => {
  const params = new URLSearchParams({ path });
  if (date) params.set("date", date);
  return apiFetch<SitePublicContent>(withRouteSearch(apiRoutes.siteContent.read.build(), params), { auth: "omit" });
};
