import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

interface AdminSectionHeaderProps {
  title: string;
  description?: string;
  count?: number;
  actions?: ReactNode;
}

export function AdminSectionHeader({
  title,
  description,
  count,
  actions,
}: AdminSectionHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          {typeof count === "number" && (
            <Badge variant="secondary" className="h-5 px-2 text-xs">
              {count}
            </Badge>
          )}
        </div>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

