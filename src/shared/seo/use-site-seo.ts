import { useContext, useEffect, useId } from "react";
import type { SiteSeoMetadata } from "@contracts/site-seo";
import { SeoOverrideContext } from "./site-seo-context";

export const useSiteSeo = (metadata: SiteSeoMetadata | null, priority = 0): void => {
  const owner = useId();
  const update = useContext(SeoOverrideContext);
  useEffect(() => {
    update(owner, metadata, priority);
    return () => update(owner, null, priority);
  }, [metadata, update, owner, priority]);
};
