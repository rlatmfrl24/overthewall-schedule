import { createContext, useCallback, useContext, useState } from "react";

export interface ConsoleSearch {
  channel?: string;
  channelKind?: "official_video" | "singing_clip";
  kind?: "official" | "broadcast" | "all";
  view?: string;
  sort?: string;
  pageSize?: number;
  tab?: string;
  source?: string;
  q?: string;
  state?: string;
  category?: string;
  page?: number;
  selected?: string;
  proposal?: string;
  from?: string;
  until?: string;
  date?: string;
  mode?: "grid" | "timeline";
  theme?: "light" | "dark";
  design?: "poster" | "legacy";
}

export function validateConsoleSearch(search: Record<string, unknown>): ConsoleSearch {
  const result: ConsoleSearch = {};
  for (const key of ["channel", "view", "sort", "tab", "source", "q", "state", "category", "selected", "proposal", "from", "until", "date"] as const) {
    if (typeof search[key] === "string" && search[key]) result[key] = search[key].slice(0, 200);
  }
  if (["official", "broadcast", "all"].includes(String(search.kind))) result.kind = search.kind as ConsoleSearch["kind"];
  if (search.channelKind === "official_video" || search.channelKind === "singing_clip") result.channelKind = search.channelKind;
  const pageSize = Number(search.pageSize);
  if ([25, 50, 100, 200].includes(pageSize)) result.pageSize = pageSize;
  const page = Number(search.page);
  if (Number.isSafeInteger(page) && page > 0) result.page = page;
  if (search.mode === "grid" || search.mode === "timeline") result.mode = search.mode;
  if (search.theme === "light" || search.theme === "dark") result.theme = search.theme;
  if (search.design === "poster" || search.design === "legacy") result.design = search.design;
  return result;
}

export type ConsoleSearchUpdater = (patch: ConsoleSearch, replace?: boolean) => void;
export const ConsoleSearchContext = createContext<readonly [ConsoleSearch, ConsoleSearchUpdater] | null>(null);

// Feature panels also work as standalone controlled views; the admin shell supplies URL authority.
export function useConsoleSearch() {
  const context = useContext(ConsoleSearchContext);
  const [local, setLocal] = useState<ConsoleSearch>({});
  const update: ConsoleSearchUpdater = useCallback((patch) => setLocal((previous) => ({...previous, ...patch})), []);
  return context ?? [local, update] as const;
}
