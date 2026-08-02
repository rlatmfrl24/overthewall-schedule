import { createContext } from "react";
import type { SiteSeoMetadata } from "@contracts/site-seo";

export type SeoOverrideContextValue = (metadata: SiteSeoMetadata | null) => void;
export const SeoOverrideContext = createContext<SeoOverrideContextValue>(
  () => undefined,
);
