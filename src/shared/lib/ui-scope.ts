import { createContext, useContext } from "react";

export type UiScope = "public" | "admin" | "play";
export const UiScopeContext = createContext<UiScope>("public");
export function useUiScopeClassName() {
  const scope = useContext(UiScopeContext);
  return scope === "play" ? "otw-play-glass" : scope === "admin" ? "admin-console" : undefined;
}
