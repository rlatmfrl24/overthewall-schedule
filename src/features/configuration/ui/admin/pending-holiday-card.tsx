import type { PendingSchedule } from "@/features/schedules";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { PendingExistingSchedules } from "./pending-existing-schedules";

export function PendingHolidayCard({ pending, dateLabel, createdLabel, busy, onApprove, onReject }: {
  pending: PendingSchedule;
  dateLabel: string;
  createdLabel: string;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const evidence = pending.holiday_evidence;
  const stale = !evidence || evidence.scan_status !== "complete" || evidence.broadcast_seen || pending.same_day_schedule_count > 0;
  return (
    <article className="space-y-3 rounded-lg border bg-background p-4" aria-label={`${pending.member_name} 휴방 추정`}>
      <h3 className="font-semibold">{dateLabel}</h3>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">휴방 추정</Badge>
        <span className="font-semibold">{pending.member_name}</span>
      </div>
      <p className="text-sm">해당 날짜의 등록 일정과 방송 기록이 확인되지 않았습니다. 기록이 남지 않은 방송이 있을 수 있으므로 확인 후 승인해 주세요.</p>
      <p className="text-xs text-muted-foreground">
        추천 생성: {createdLabel} · 확인: {evidence ? new Date(evidence.checked_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "확인 정보 없음"} (한국 시간)
      </p>
      {evidence && <p className="text-xs text-muted-foreground">
        확인 범위: {new Date(evidence.range_start).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} ~ {new Date(evidence.range_end).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} (종료 시각 미포함)
      </p>}
      <PendingExistingSchedules pending={pending} />
      {stale && <p role="status" className="text-sm text-destructive">확인 근거가 변경되었거나 불완전한 오래된 요청입니다. 다시 수집한 뒤 확인해 주세요.</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || stale || pending.is_processed} onClick={onApprove}>휴방 승인</Button>
        <Button size="sm" variant="outline" disabled={busy || pending.is_processed} onClick={onReject}>거부</Button>
      </div>
    </article>
  );
}
