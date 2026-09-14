import { createContext, useContext, useEffect, useId } from "react";

export type PreservedNavigation = (navigation: {
  current: { pathname: string; search: object };
  next: { pathname: string; search: object };
}) => boolean;

export const UnsavedChangesContext = createContext<{register: (id: string, dirty: boolean, preservedNavigation?: PreservedNavigation) => void; confirm: () => Promise<boolean>} | null>(null);

export function useUnsavedChanges(dirty: boolean, preservedNavigation?: PreservedNavigation) {
  const context = useContext(UnsavedChangesContext);
  const register = context?.register;
  const id = useId();
  useEffect(() => {
    register?.(id, dirty, preservedNavigation);
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    if (dirty) window.addEventListener("beforeunload", beforeUnload);
    return () => { register?.(id, false); window.removeEventListener("beforeunload", beforeUnload); };
  }, [dirty, id, register, preservedNavigation]);
  return async () => {
    if (!dirty) return true;
    if (!context) throw new Error("Unsaved changes require InteractionProvider.");
    return context.confirm();
  };
}
