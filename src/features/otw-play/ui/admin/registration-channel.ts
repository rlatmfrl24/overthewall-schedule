import type { OtwPlayChannelRole } from "@contracts/otw-play";
import type { ConsoleSearch } from "@/shared/lib/admin-console-search";
import type { PreservedNavigation } from "@/shared/lib/unsaved-changes";

export interface RegistrationChannelTarget {
  externalChannelId: string;
  displayName: string;
  kind: "official_video" | "singing_clip";
  role: OtwPlayChannelRole;
}

export interface RegistrationChannelVisit {
  target: RegistrationChannelTarget;
  returnSearch: ConsoleSearch;
}

export const isRegistrationChannelSearch = (search: ConsoleSearch, visit: RegistrationChannelVisit) =>
  search.tab === "channels" && search.view === "channel-edit" &&
  search.from === "play-registration" && search.channel === visit.target.externalChannelId;

export const preservesRegistrationVisit = (visit: RegistrationChannelVisit): PreservedNavigation =>
  ({ current, next }) => {
    if (current.pathname !== "/admin/otw-play" || next.pathname !== current.pathname) return false;
    const matchesReturn = (search: ConsoleSearch) => {
      const keys = new Set([...Object.keys(search), ...Object.keys(visit.returnSearch)]);
      return [...keys].every(key => search[key as keyof ConsoleSearch] === visit.returnSearch[key as keyof ConsoleSearch]);
    };
    return (isRegistrationChannelSearch(current.search, visit) && matchesReturn(next.search)) ||
      (matchesReturn(current.search) && isRegistrationChannelSearch(next.search, visit));
  };
