import { createContext } from "react";
import type { SiteSeoMetadata } from "@contracts/site-seo";

export type SeoOverrideContextValue = (owner: string, metadata: SiteSeoMetadata | null, priority: number) => void;
export const SeoOverrideContext = createContext<SeoOverrideContextValue>(
  () => undefined,
);
