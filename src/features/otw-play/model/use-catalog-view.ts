import { useState } from "react";

export type CatalogView = "card" | "table" | "grid";
const STORAGE_KEY = "otw-play:catalog-view:v1";
export function useCatalogView() {
  const [view, setView] = useState<CatalogView>(() => {
    try {
      const value = window.localStorage.getItem(STORAGE_KEY);
      return value === "table" || value === "grid" ? value : "card";
    } catch { return "card"; }
  });
  return [view, (next: CatalogView) => {
    setView(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* Storage is optional. */ }
  }] as const;
}
