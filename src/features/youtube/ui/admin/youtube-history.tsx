import { SavedMediaHistory, SavedMediaHistoryEntry } from "@/app/admin";
import { formatHistoryDate } from "@/shared/lib/history-date";
import { Badge } from "@/shared/ui/badge";
import { fetchYouTubeHistory } from "../../api/history";

export function YouTubeHistory() {
  return <SavedMediaHistory
    title="YouTube 저장 이력"
    description="공식 영상·Shorts·다시보기의 저장 기록을 읽기 전용으로 확인합니다. 표시 시각은 한국시간입니다."
    queryName="youtube-history"
    channelLabel="저장 영상 채널"
    fetchPage={fetchYouTubeHistory}
    renderItem={(item) => <SavedMediaHistoryEntry
      key={item.videoId}
      title={item.title}
      badges={<>
        <Badge variant="secondary">{item.isShort ? "Shorts" : "영상·다시보기"}</Badge>
        <Badge variant="outline">{item.contentAccess === "admin_archive" ? "관리자 보관 · 읽기 전용" : "일반 · 읽기 전용"}</Badge>
        {!item.available && <Badge variant="outline" className="text-muted-foreground">제공자 이용 불가</Badge>}
      </>}
      dates={<>
        <div><dt>게시</dt><dd>{formatHistoryDate(item.publishedAt)}</dd></div>
        <div><dt>저장</dt><dd>{formatHistoryDate(item.storedAt)}</dd></div>
      </>}
      metadata={item}
    >
      <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{item.channelTitle || item.channelId}</p>
    </SavedMediaHistoryEntry>}
  />;
}
