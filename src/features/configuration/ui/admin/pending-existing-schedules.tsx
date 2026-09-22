import { Calendar, Clock } from "lucide-react";
import type { PendingSchedule } from "@/features/schedules";
import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/lib/utils";

const timeMinutes = (value: string | null) => {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};

const durationLabel = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return [hours ? `${hours}시간` : "", remainder ? `${remainder}분` : ""].filter(Boolean).join(" ");
};

export function PendingExistingSchedules({ pending, selectedScheduleId = null }: {
  pending: PendingSchedule;
  selectedScheduleId?: number | null;
}) {
  const isHoliday = pending.candidate_kind === "holiday_suggestion";
  const candidateStart = isHoliday ? null : timeMinutes(pending.start_time);
  const schedules = [...pending.same_day_schedules].sort((a, b) =>
    (timeMinutes(a.start_time) ?? Infinity) - (timeMinutes(b.start_time) ?? Infinity) || a.id - b.id);
  const differences = schedules.flatMap(schedule => {
    const start = timeMinutes(schedule.start_time);
    return schedule.status !== "휴방" && start !== null && candidateStart !== null ? [Math.abs(start - candidateStart)] : [];
  });
  const nearest = differences.length ? Math.min(...differences) : null;
  const hasUnknownTime = schedules.some(schedule => timeMinutes(schedule.start_time) === null && schedule.status !== "휴방");
  const dateLabel = `${pending.date} (${new Date(`${pending.date}T12:00:00+09:00`).toLocaleDateString("ko-KR", { weekday: "short", timeZone: "Asia/Seoul" })})`;

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border bg-card" aria-label={`${pending.member_name} ${pending.date} 기존 일정 비교`}>
      <div className="space-y-3 border-b bg-muted/30 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h4 className="flex items-center gap-2 text-sm font-semibold">
              <Calendar aria-hidden="true" className="size-4 text-muted-foreground" />
              같은 날짜의 기존 일정
              <span className="tabular-nums">{schedules.length}건</span>
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">{pending.member_name} · {dateLabel} · 한국 시간</p>
          </div>
          {selectedScheduleId !== null && schedules.some(schedule => schedule.id === selectedScheduleId) && (
            <Badge variant="outline">수정 대상 1건 선택됨</Badge>
          )}
        </div>
        {!isHoliday && (
          <div className="grid gap-1 text-sm sm:grid-cols-[120px_minmax(0,1fr)]">
            <span className="text-xs text-muted-foreground">수집된 방송 시작</span>
            <div className="min-w-0">
              <span className="font-semibold tabular-nums">{pending.start_time || "시각 확인 필요"}</span>
              <span className="ml-2 whitespace-pre-wrap break-words">{pending.title?.trim() || "제목 없음"}</span>
            </div>
          </div>
        )}
      </div>
      {schedules.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">이 멤버의 해당 날짜에 등록된 일정이 없습니다.</p>
      ) : (
        <ul className="divide-y">
          {schedules.map(schedule => {
            const start = timeMinutes(schedule.start_time);
            const difference = schedule.status !== "휴방" && start !== null && candidateStart !== null ? start - candidateStart : null;
            const selected = schedule.id === selectedScheduleId;
            const ranked = pending.ranked_schedules?.find(item => item.id === schedule.id);
            const canFill = ["방송", "미정"].includes(schedule.status);
            const missing = canFill ? [start === null ? "시간 미입력" : null, !schedule.title?.trim() ? "제목 미입력" : null].filter(Boolean) : [];
            return (
              <li key={schedule.id} className={cn("grid min-w-0 gap-3 p-4 sm:grid-cols-[96px_minmax(0,1fr)]", selected && "bg-primary/5")}>
                <div className="flex items-baseline gap-2 sm:block">
                  <p className="text-lg font-semibold tabular-nums">{schedule.status === "휴방" ? "종일" : schedule.start_time?.trim() || "시간 미정"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">등록 일정 #{schedule.id}</p>
                </div>
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={selected ? "default" : "secondary"}>{schedule.status}</Badge>
                    {selected && <span className="text-xs font-semibold text-primary">현재 수정 대상</span>}
                    {difference !== null && Math.abs(difference) === nearest && <span className="text-xs text-muted-foreground">추천 시각과 가장 가까움</span>}
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm font-medium leading-relaxed">{schedule.title?.trim() || (schedule.status === "휴방" ? "휴방 일정" : "등록된 제목 없음")}</p>
                  {missing.length > 0 && <p className="text-xs text-muted-foreground">보완할 정보: {missing.join(" · ")}</p>}
                  {!isHoliday && (
                    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <Clock aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
                      {schedule.status === "휴방" ? "같은 날짜에 휴방이 등록되어 있습니다."
                        : difference === null ? "시작 시각이 없어 추천과의 시간 차이를 비교할 수 없습니다."
                        : difference === 0 ? "추천 시작 시각과 동일"
                        : `추천 시작보다 ${durationLabel(Math.abs(difference))} ${difference < 0 ? "전" : "후"} (${Math.abs(difference)}분 차이)`}
                    </p>
                  )}
                  {ranked && <p className="text-xs text-muted-foreground">
                    연결 근거: {ranked.reason === "time_window" ? "예정 시각 근접" : ranked.reason === "title_similarity" ? "제목 유사" : "빈 일정 보완 후보"}
                    {ranked.reason === "title_similarity" ? ` · 제목 유사도 ${Math.round(ranked.title_similarity * 100)}%` : ""}
                  </p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {pending.candidate_kind === "missing_schedule" && schedules.length > 0 && (
        <p className="border-t bg-muted/20 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          {hasUnknownTime ? "시간 미정 일정이 있습니다. 추가 일정으로 승인하기 전에 기존 일정을 확인해 주세요."
            : nearest !== null && nearest < 240 ? "가장 가까운 일정과 4시간 미만입니다. 중복 추천인지 확인해 주세요."
            : "추가 추천 기준은 가장 가까운 기존 시작 시각과 4시간 이상입니다. 기존 일정의 제목과 상태도 함께 확인해 주세요."}
        </p>
      )}
    </section>
  );
}
