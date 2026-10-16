import { createContext, useContext } from "react";

// A rendering/cache identity only. Server permissions remain authoritative.
export const ContentSessionContext = createContext<string | null>(null);
export const useContentSession = () => useContext(ContentSessionContext);
