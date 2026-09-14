import type { PreservedNavigation } from "@/shared/lib/unsaved-changes";
import type { ConsoleSearch } from "@/shared/lib/admin-console-search";

// The catalog manager keeps review forms mounted across these local surfaces.
// Other destinations and browser reloads still require unsaved-input protection.
export const preservesPlayReview: PreservedNavigation = ({ current, next }) => {
  if (current.pathname !== next.pathname || next.pathname !== "/admin/otw-play") return false;
  const search = next.search as ConsoleSearch;
  if (search.tab === "import") return true;
  return search.tab === "channels" && search.view === "channel-edit"
    && search.from === "play-review" && typeof search.channel === "string";
};
