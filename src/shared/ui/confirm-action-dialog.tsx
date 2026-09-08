import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { useRef, type ReactNode } from "react";

interface ConfirmActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  isProcessing?: boolean;
  confirmDisabled?: boolean;
  destructive?: boolean;
  restoreFocusTo?: HTMLElement | null;
}

export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "확인",
  cancelLabel = "취소",
  onConfirm,
  isProcessing = false,
  confirmDisabled = false,
  destructive = false,
  restoreFocusTo,
}: ConfirmActionDialogProps) {
  const invokingElement = useRef<HTMLElement | null>(null);
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!isProcessing) onOpenChange(next); }}>
      <AlertDialogContent onOpenAutoFocus={() => {
        // Controlled dialogs do not have a Radix Trigger to restore automatically.
        invokingElement.current = document.activeElement instanceof HTMLElement
          ? document.activeElement : null;
      }} onCloseAutoFocus={(event) => {
        const target = restoreFocusTo ?? invokingElement.current;
        if (target?.isConnected) {
          event.preventDefault();
          target.focus();
        }
      }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {typeof description === "string" ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : (
            <AlertDialogDescription asChild>
              <div>{description}</div>
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isProcessing}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isProcessing || confirmDisabled}
            onClick={onConfirm}
            className={destructive ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
          >
            {isProcessing ? "처리 중..." : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

