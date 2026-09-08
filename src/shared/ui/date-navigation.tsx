import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/shared/lib/utils";

export function DateNavigation({ previousLabel, nextLabel, todayLabel, compactTodayLabel, isCurrent, onPrevious, onNext, onToday, className }: {
  previousLabel: string; nextLabel: string; todayLabel: string; compactTodayLabel?: string;
  isCurrent: boolean; onPrevious: () => void; onNext: () => void; onToday: () => void; className?: string;
}) {
  return <div role="group" aria-label="날짜 이동" className={cn("flex items-center justify-between gap-1.5 rounded-full border border-border bg-card p-1 shadow-sm sm:gap-2", className)}>
    <Button type="button" variant="ghost" size="icon" aria-label={previousLabel} onClick={onPrevious} className="rounded-full max-sm:size-11"><ChevronLeft className="size-5 text-muted-foreground" /></Button>
    <Button type="button" variant="ghost" disabled={isCurrent} onClick={onToday} aria-label={todayLabel} className="rounded-full px-4 text-sm max-sm:h-11">
      <span className={compactTodayLabel ? "hidden sm:inline" : undefined}>{todayLabel}</span>
      {compactTodayLabel && <span className="sm:hidden">{compactTodayLabel}</span>}
    </Button>
    <Button type="button" variant="ghost" size="icon" aria-label={nextLabel} onClick={onNext} className="rounded-full max-sm:size-11"><ChevronRight className="size-5 text-muted-foreground" /></Button>
  </div>;
}
