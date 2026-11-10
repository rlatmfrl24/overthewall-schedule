import { SavedMediaHistory, SavedMediaHistoryEntry } from "@/app/admin";
import { formatHistoryDate } from "@/shared/lib/history-date";
import { Badge } from "@/shared/ui/badge";
import { fetchChzzkHistory } from "../api/history";

export function ChzzkHistory() {
  return <SavedMediaHistory
    title="CHZZK 저장 이력"
    description="채널별 다시보기·클립 저장본을 읽기 전용으로 확인합니다. 표시 시각은 한국시간입니다."
    queryName="chzzk-history"
    channelLabel="저장 이력 채널"
    channelRequired
    fetchPage={async (channelId, cursor) => {
      const { channels, snapshots, nextCursor } = await fetchChzzkHistory(channelId, cursor);
      return { channels, items: snapshots, nextCursor };
    }}
    renderItem={(snapshot) => <SavedMediaHistoryEntry
      key={snapshot.key}
      title={snapshot.type === "vods" ? "다시보기" : "클립"}
      badges={<>
        <Badge variant="secondary">{snapshot.content.data.length}건</Badge>
        <Badge variant="outline">{snapshot.contentAccess === "admin_archive" ? "관리자 보관 · 읽기 전용" : snapshot.contentAccess === "normal" ? "일반 · 읽기 전용" : "저장 이력 · 읽기 전용"}</Badge>
      </>}
      dates={<div><dt>저장</dt><dd>{formatHistoryDate(snapshot.storedAt)}</dd></div>}
      metadata={snapshot.content}
    >
      {snapshot.content.data.length > 0 && <ul aria-label="저장 영상 제목" className="list-inside list-disc space-y-0.5 text-sm [overflow-wrap:anywhere]">
        {snapshot.content.data.slice(0, 3).map((item) => <li key={"videoTitle" in item ? item.videoNo : item.clipUID}>{"videoTitle" in item ? item.videoTitle : item.clipTitle}</li>)}
        {snapshot.content.data.length > 3 && <li className="list-none text-xs text-muted-foreground">외 {snapshot.content.data.length - 3}건 · 저장 메타데이터에서 확인</li>}
      </ul>}
    </SavedMediaHistoryEntry>}
  />;
}
