import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useBlocker } from "@tanstack/react-router";
import { ConfirmationContext, type ConfirmationOptions } from "@/shared/lib/confirmation";
import { UnsavedChangesContext, type PreservedNavigation } from "@/shared/lib/unsaved-changes";
import { ConfirmActionDialog } from "@/shared/ui/confirm-action-dialog";

type Request = { options: ConfirmationOptions; resolve: (value: boolean) => void; trigger: HTMLElement | null };

export function InteractionProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const current = useRef<Request | null>(null);
  const dirtyForms = useRef(new Map<string, PreservedNavigation | undefined>());
  const confirm = useCallback((options: ConfirmationOptions) => {
    // A second click must not resolve the same confirmation into two mutations.
    if (current.current) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const next = { options, resolve, trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null };
      current.current = next;
      setRequest(next);
    });
  }, []);
  const resolve = useCallback((value: boolean) => {
    const pending = current.current;
    current.current = null;
    setRequest(null);
    pending?.resolve(value);
  }, []);
  useEffect(() => () => { current.current?.resolve(false); current.current = null; }, []);
  const register = useCallback((id: string, dirty: boolean, preservedNavigation?: PreservedNavigation) => {
    if (dirty) dirtyForms.current.set(id, preservedNavigation); else dirtyForms.current.delete(id);
  }, []);
  const confirmDiscard = useCallback(() => confirm({
    title: "저장하지 않은 변경 사항",
    description: "입력 내용을 버리고 이동할까요? 계속 편집하면 입력값을 유지합니다.",
    confirmLabel: "변경 버리고 이동", cancelLabel: "계속 편집",
  }), [confirm]);
  useBlocker({ shouldBlockFn: async (navigation) => [...dirtyForms.current.values()].some(preserves => !preserves?.(navigation)) && !await confirmDiscard(), enableBeforeUnload: false });
  const unsaved = useMemo(() => ({ register, confirm: confirmDiscard }), [register, confirmDiscard]);
  return <ConfirmationContext value={confirm}><UnsavedChangesContext value={unsaved}>
    {children}
    {request && <ConfirmActionDialog open onOpenChange={(open) => { if (!open) resolve(false); }}
      {...request.options} restoreFocusTo={request.trigger} onConfirm={() => resolve(true)} />}
  </UnsavedChangesContext></ConfirmationContext>;
}
