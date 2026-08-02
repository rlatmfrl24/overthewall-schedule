import { useContext, useEffect } from "react";
import type { SiteSeoMetadata } from "@contracts/site-seo";
import { SeoOverrideContext } from "./site-seo-context";

export const useSiteSeo = (metadata: SiteSeoMetadata | null): void => {
  const update = useContext(SeoOverrideContext);
  useEffect(() => {
    update(metadata);
    return () => update(null);
  }, [metadata, update]);
};
