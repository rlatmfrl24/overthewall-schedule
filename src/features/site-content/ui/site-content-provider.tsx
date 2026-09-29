import { useState, type ReactNode } from "react";
import { SiteContentDateContext, SiteContentSelectedDateContext } from "../model/date-context";
export function SiteContentProvider({ pathname, children }: { pathname: string; children: ReactNode }) {
  const [date, setDate] = useState<string>();
  const [previousPathname, setPreviousPathname] = useState(pathname);
  // Clear route-owned metadata before children can request the new path.
  if (previousPathname !== pathname) {
    setPreviousPathname(pathname);
    setDate(undefined);
  }
  return <SiteContentDateContext value={setDate}><SiteContentSelectedDateContext value={date}>{children}</SiteContentSelectedDateContext></SiteContentDateContext>;
}
