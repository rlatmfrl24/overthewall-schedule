import type { ReactNode } from "react";
import { Button } from "./button";
import { cn } from "@/shared/lib/utils";

export function TabsList<T extends string>({ value, onValueChange, label, items, className }: {
  value: T;
  onValueChange: (value: T) => void;
  label: string;
  items: readonly { value: T; label: ReactNode; id: string; panelId: string; disabled?: boolean }[];
  className?: string;
}) {
  return <div role="tablist" aria-label={label} className={cn("flex gap-1 overflow-x-auto rounded-lg border bg-muted/25 p-1", className)}
    onKeyDown={(event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'));
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (index < 0 || !buttons.length) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
      buttons[next].click();
    }}>
    {items.map((item) => <Button key={item.value} id={item.id} type="button" role="tab"
      aria-selected={value === item.value} aria-controls={item.panelId} tabIndex={value === item.value ? 0 : -1}
      disabled={item.disabled} variant={value === item.value ? "default" : "ghost"}
      className="shrink-0 max-sm:min-h-11" onClick={() => onValueChange(item.value)}>{item.label}</Button>)}
  </div>;
}
