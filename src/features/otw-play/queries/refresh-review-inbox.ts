import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { OtwPlayReviewFilters, OtwPlayReviewPageDto } from "@contracts/otw-play";

/** A refreshed page can have different cursors; never replay all accumulated pages. */
export async function refreshReviewInbox(client: QueryClient, filters?: OtwPlayReviewFilters) {
  const match = { queryKey: filters ? ["otw-play-review-inbox", filters] : ["otw-play-review-inbox"], exact: Boolean(filters) };
  await client.cancelQueries(match);
  client.setQueriesData<InfiniteData<OtwPlayReviewPageDto, string | null>>(match, previous => previous ? {
    pages: previous.pages.slice(0, 1), pageParams: previous.pageParams.slice(0, 1),
  } : previous);
  return client.invalidateQueries(match);
}
