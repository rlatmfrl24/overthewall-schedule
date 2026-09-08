import { createContext, useContext, useEffect, useId } from "react";

export const UnsavedChangesContext = createContext<{register: (id: string, dirty: boolean) => void; confirm: () => Promise<boolean>} | null>(null);

export function useUnsavedChanges(dirty: boolean) {
  const context = useContext(UnsavedChangesContext);
  const register = context?.register;
  const id = useId();
  useEffect(() => {
    register?.(id, dirty);
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    if (dirty) window.addEventListener("beforeunload", beforeUnload);
    return () => { register?.(id, false); window.removeEventListener("beforeunload", beforeUnload); };
  }, [dirty, id, register]);
  return async () => {
    if (!dirty) return true;
    if (!context) throw new Error("Unsaved changes require InteractionProvider.");
    return context.confirm();
  };
}
