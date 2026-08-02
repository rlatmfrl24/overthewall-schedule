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
  const [override, setOverride] = useState<SiteSeoMetadata | null>(null);
  useEffect(() => setOverride(null), [pathname]);
  useEffect(() => applySiteSeo(override ?? base), [base, override]);
  const update = useCallback((metadata: SiteSeoMetadata | null) => {
    setOverride(metadata);
  }, []);
  return (
    <SeoOverrideContext.Provider value={update}>
      {children}
    </SeoOverrideContext.Provider>
  );
};
