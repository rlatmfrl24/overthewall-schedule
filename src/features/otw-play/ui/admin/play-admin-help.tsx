import type { ReactNode } from "react";

export function PlayAdminHelp({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="w-fit cursor-pointer py-1 font-medium">{title}</summary>
      <div className="mt-1 max-w-3xl space-y-2 leading-relaxed">{children}</div>
    </details>
  );
}
