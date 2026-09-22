import { createContext, useContext, useEffect } from "react";
export const SiteContentDateContext = createContext<(value: string | undefined) => void>(() => {});
export const SiteContentSelectedDateContext = createContext<string | undefined>(undefined);
export function useSiteContentDate(date: string) {
  const setDate = useContext(SiteContentDateContext);
  useEffect(() => { setDate(date); return () => setDate(undefined); }, [date, setDate]);
}
