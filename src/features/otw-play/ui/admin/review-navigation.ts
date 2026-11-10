import type { PreservedNavigation } from "@/shared/lib/unsaved-changes";
import type { ConsoleSearch } from "@/shared/lib/admin-console-search";

export const preservesPlayReview: PreservedNavigation = ({ current, next }) => {
  if (current.pathname !== next.pathname || next.pathname !== "/admin/otw-play") return false;
  const from = current.search as ConsoleSearch;
  const to = next.search as ConsoleSearch;
  if (from.tab === "playlists" || to.tab === "playlists") return false;
  // Opening another card or leaving the import workspace unmounts its editor.
  if (from.category && (from.tab === "import" || from.from === "play-review")) return from.category === to.category;
  return true;
};
