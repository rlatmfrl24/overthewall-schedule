import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

export function FilterChip({ selected, layout = "wrap", className, ...props }: ComponentProps<"button"> & {
  selected: boolean;
  layout?: "wrap" | "vertical";
}) {
  return <button {...props} type="button" aria-pressed={selected} data-slot="filter-chip"
    className={cn(
      "relative inline-flex shrink-0 items-center gap-1.5 text-sm font-medium border-2 transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 motion-reduce:transition-none",
      layout === "vertical" ? "min-h-10 w-full justify-start rounded-md border px-3" : "min-h-9 rounded-full px-3 py-1.5",
      "max-sm:min-h-11",
      selected ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-transparent text-muted-foreground border-border hover:border-primary/50",
      className,
    )} />;
}
