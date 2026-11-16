import { Ban, Clock3, Flame, Radio } from "lucide-react";
import { Card, CardContent } from "@/shared/ui/card";
import { cn, getContrastColor, hexToRgba } from "@/shared/lib/utils";
import type { ScheduleStatus } from "../model/schedule";

export function SchedulePreviewCard({ status, title, startTime, mainColor }: {
  status: ScheduleStatus;
  title: string | null;
  startTime: string | null;
  mainColor?: string | null;
}) {
  const accent = mainColor && /^#[\da-f]{6}$/i.test(mainColor) ? mainColor : undefined;
  const StatusIcon = status === "휴방" ? Ban : status === "게릴라" ? Flame : Radio;
  const fallback = { 방송: "방송 예정", 휴방: "오늘은 휴방입니다", 게릴라: "게릴라 방송 예정", 미정: "방송 시간 미정" };
  const rawTitle = title?.trim();
  const displayTitle = rawTitle && !(status !== "방송" && rawTitle === status) ? rawTitle : fallback[status];
  return <Card role="article" aria-label="일정 미리보기" className="gap-0 py-4 shadow-none"
    style={status === "방송" && accent ? { borderColor: hexToRgba(accent, 0.4) } : undefined}>
    <CardContent className="space-y-3 px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold",
          status === "휴방" ? "bg-rose-600 text-white" : status === "게릴라" ? "bg-amber-500 text-amber-950" : "bg-primary text-primary-foreground")}
          style={status === "방송" && accent ? { backgroundColor: accent, color: getContrastColor(accent) } : undefined}>
          <StatusIcon aria-hidden="true" className="size-3.5" />{status}
        </span>
        {(status === "방송" || status === "미정") && <span aria-label="방송 시간" className="inline-flex items-center gap-2 text-2xl font-semibold leading-none tabular-nums">
          <Clock3 aria-hidden="true" className="size-4 text-muted-foreground" />{startTime?.slice(0, 5) ?? "시간 미정"}
        </span>}
      </div>
      <p className="whitespace-pre-wrap break-words text-lg font-semibold leading-relaxed">{displayTitle}</p>
    </CardContent>
  </Card>;
}
