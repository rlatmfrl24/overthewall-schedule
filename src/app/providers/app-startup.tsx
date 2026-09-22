import { useEffect, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

/** Release the initial document loader after the route (including error pages) has settled. */
export function AppStartup({ children }: { children: ReactNode }) {
  const ready = useRouterState({
    select: state => state.status === "idle" && !state.isLoading && state.matches.length > 0,
  });
  useEffect(() => {
    if (ready) window.dispatchEvent(new Event("otw:app-ready"));
  }, [ready]);
  return <>{children}</>;
}
