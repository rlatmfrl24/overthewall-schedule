import type { PreservedNavigation } from "@/shared/lib/unsaved-changes";
import type { ConsoleSearch } from "@/shared/lib/admin-console-search";

// Catalog, import, channels and operations share the mounted catalog manager.
// Playlists replace it; other pages and reloads also discard the review forms.
export const preservesPlayReview: PreservedNavigation = ({ current, next }) => {
  if (current.pathname !== next.pathname || next.pathname !== "/admin/otw-play") return false;
  return (current.search as ConsoleSearch).tab !== "playlists"
    && (next.search as ConsoleSearch).tab !== "playlists";
};
