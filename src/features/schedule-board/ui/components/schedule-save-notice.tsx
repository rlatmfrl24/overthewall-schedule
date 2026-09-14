import { format } from "date-fns";
import { Button } from "@/shared/ui/button";
import type { Member } from "@/features/members";
import type { ScheduleSaveFeedback } from "../../queries/use-schedule-save-feedback";

export function ScheduleSaveNotice({ feedback, members, onView, onDismiss, onRetry }: {
  feedback: ScheduleSaveFeedback | null;
  members: Member[];
  onView: (date: Date) => void;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  if (!feedback) return null;
  const member = members.find((item) => item.uid === feedback.member_uid);
  return (
    <div className="mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 sm:mx-6 lg:mx-8">
      <div role="status" className="min-w-0 text-sm">
        <p className="font-medium">
          {format(feedback.date, "M월 d일")} {member?.name ?? "멤버"} 일정이 {feedback.id ? "수정" : "추가"}됐어요.
        </p>
        <p className="break-words text-muted-foreground">
          {feedback.status === "방송" ? feedback.start_time ?? "시간 미정" : feedback.status} · {feedback.title || feedback.status}
          {feedback.deletedCount > 0 && ` · 기존 일정 ${feedback.deletedCount}건 삭제됨`}
        </p>
        {feedback.refresh === "pending" && <p>일정표를 새로 불러오는 중이에요.</p>}
        {feedback.refresh === "failed" && <p className="text-destructive">저장은 완료됐지만 일정표를 불러오지 못했어요. 다시 불러와주세요.</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {feedback.refresh === "failed" && <Button size="sm" variant="outline" onClick={onRetry}>일정표 다시 불러오기</Button>}
        <Button size="sm" variant="outline" onClick={() => onView(feedback.date)}>저장한 날짜 보기</Button>
        <Button size="sm" variant="ghost" onClick={onDismiss} aria-label="저장 안내 닫기">닫기</Button>
      </div>
    </div>
  );
}
