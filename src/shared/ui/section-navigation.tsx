import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

/** Navigation slots stay router-owned links; this primitive owns their presentation. */
export function SectionNavigation({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <nav aria-label={label} data-slot="section-navigation" className={cn("flex min-w-0 items-center gap-1 overflow-x-auto border-b", className)}>{children}</nav>;
}

export const sectionNavigationItemClassName = "inline-flex shrink-0 items-center justify-center rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground aria-[current=page]:font-semibold max-sm:min-h-11";
