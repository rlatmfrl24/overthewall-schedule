import { useState, type ReactNode } from "react";
import { SiteContentDateContext, SiteContentSelectedDateContext } from "../model/date-context";
export function SiteContentProvider({ children }: { children: ReactNode }) {
  const [date, setDate] = useState<string>();
  return <SiteContentDateContext value={setDate}><SiteContentSelectedDateContext value={date}>{children}</SiteContentSelectedDateContext></SiteContentDateContext>;
}
