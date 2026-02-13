import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type ToastVariant = "success" | "error" | "info";

type ToastInput = {
  title?: string;
  description: string;
  variant?: ToastVariant;
  durationMs?: number;
};

type ToastItem = {
  id: number;
  title?: string;
  description: string;
  variant: ToastVariant;
  durationMs: number;
};

type ToastContextValue = {
  toast: (input: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);
const DEFAULT_DURATION_MS = 3200;

function ToastIcon({ variant }: { variant: ToastVariant }) {
  if (variant === "success") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  }
  if (variant === "error") {
    return <AlertCircle className="h-4 w-4 text-destructive" />;
  }
  return <Info className="h-4 w-4 text-primary" />;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((input: ToastInput) => {
    const id = ++idRef.current;
    const nextToast: ToastItem = {
      id,
      title: input.title,
      description: input.description,
      variant: input.variant ?? "info",
      durationMs: input.durationMs ?? DEFAULT_DURATION_MS,
    };
    setToasts((prev) => [...prev, nextToast]);
    setTimeout(() => dismiss(id), nextToast.durationMs);
  }, [dismiss]);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[120] flex justify-center px-3 sm:inset-auto sm:right-4 sm:bottom-4 sm:px-0">
        <div className="flex w-full max-w-sm flex-col gap-2">
          {toasts.map((item) => (
            <div
              key={item.id}
              role="status"
              className={cn(
                "pointer-events-auto rounded-lg border bg-background/95 px-3 py-2 shadow-lg backdrop-blur",
                item.variant === "error" && "border-destructive/40",
                item.variant === "success" && "border-emerald-500/40"
              )}
            >
              <div className="flex items-start gap-2">
                <ToastIcon variant={item.variant} />
                <div className="min-w-0 flex-1">
                  {item.title ? (
                    <p className="text-sm font-semibold">{item.title}</p>
                  ) : null}
                  <p className="text-sm text-muted-foreground break-words">
                    {item.description}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-6 w-6 shrink-0"
                  onClick={() => dismiss(item.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
