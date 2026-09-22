import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { SiteSeoMetadata } from "@contracts/site-seo";
import { resolveSiteSeo } from "@contracts/site-seo";
import { applySiteSeo } from "./apply-site-seo";
import { SeoOverrideContext } from "./site-seo-context";

export const SiteSeoProvider = ({
  pathname,
  children,
}: {
  pathname: string;
  children: ReactNode;
}) => {
  const base = useMemo(() => resolveSiteSeo(pathname), [pathname]);
  const [overrides, setOverrides] = useState<Map<string, { metadata: SiteSeoMetadata; priority: number }>>(() => new Map());
  const active = [...overrides.values()]
    .filter(({ metadata }) => metadata.path.toLowerCase() === base.path.toLowerCase())
    .sort((a, b) => b.priority - a.priority)[0]?.metadata ?? base;
  useEffect(() => applySiteSeo(active), [active]);
  const update = useCallback((owner: string, metadata: SiteSeoMetadata | null, priority: number) => {
    setOverrides(previous => {
      if (!metadata && !previous.has(owner)) return previous;
      const next = new Map(previous);
      if (metadata) next.set(owner, { metadata, priority });
      else next.delete(owner);
      return next;
    });
  }, []);
  return (
    <SeoOverrideContext.Provider value={update}>
      {children}
    </SeoOverrideContext.Provider>
  );
};
