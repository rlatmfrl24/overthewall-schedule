import type { ReactNode } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/shared/lib/utils";

/** Presentation only: the feature owns query, freshness and domain state policy. */
export function QueryState({
  state, title, description, icon, action, className, headingLevel = 2,
}: {
  state: "loading" | "error" | "empty";
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: { label?: string; onClick: () => void; pending?: boolean; icon?: ReactNode };
  className?: string;
  headingLevel?: 1 | 2 | 3;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div data-slot="query-state" data-state={state} role={state === "error" ? "alert" : "status"}
      aria-busy={state === "loading" || action?.pending || undefined}
      className={cn("flex flex-col items-center justify-center gap-3 py-8 text-center", className)}>
      {icon ?? (state === "loading" ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" /> : null)}
      <Heading className={cn("text-sm font-medium", state === "error" ? "text-destructive" : "text-muted-foreground")}>{title}</Heading>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {action && <Button type="button" variant="outline" disabled={action.pending} onClick={action.onClick}>
        {action.icon === undefined ? <RefreshCw aria-hidden="true" className={action.pending ? "animate-spin motion-reduce:animate-none" : undefined} /> : action.icon}
        {action.label ?? "다시 시도"}
      </Button>}
    </div>
  );
}
