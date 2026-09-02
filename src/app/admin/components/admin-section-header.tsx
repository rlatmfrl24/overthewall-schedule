import type { ReactNode } from "react";
import { Badge } from "@/shared/ui/badge";

interface AdminSectionHeaderProps {
  title: string;
  description?: string;
  count?: number;
  actions?: ReactNode;
  headingLevel?: 1 | 2;
}

export function AdminSectionHeader({
  title,
  description,
  count,
  actions,
  headingLevel = 2,
}: AdminSectionHeaderProps) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Heading className="text-xl font-semibold tracking-tight">{title}</Heading>
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

