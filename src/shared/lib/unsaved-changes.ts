import { createContext, useContext, useEffect, useId } from "react";

export const UnsavedChangesContext = createContext<{register: (id: string, dirty: boolean) => void; confirm: () => Promise<boolean>} | null>(null);
export const confirmDiscardChanges = () => window.confirm("저장하지 않은 변경 사항이 있습니다. 변경 사항을 버리고 이동할까요?");

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
  return async () => !dirty || (context ? await context.confirm() : confirmDiscardChanges());
}
