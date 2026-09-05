import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/query/query-keys";
import { xReferenceHealthQueryKey } from "@/features/member-posts";
import { format, isValid, parseISO } from "date-fns";
import { AutoUpdateSettingsManager } from "@/features/configuration";
import { MemberPostSettingsManager } from "@/features/member-posts";
import { OtwPlayCatalogManager } from "@/features/otw-play";
import { OperationsDashboard } from "@/features/operations";
import { NoticeManager } from "@/features/notices";
import { DDayManager } from "@/features/ddays";
import { YouTubeCacheManager, KirinukiChannelManager } from "@/features/youtube";
import { AutoUpdateLogsManager } from "@/features/audit";
import { SnapshotPreviewManager } from "@/features/schedule-board";
import { ResourceBudgets } from "./resource-budgets";
import { useConsoleSearch } from "@/shared/lib/admin-console-search";

export type ConsoleArea = "review" | "collection" | "content" | "otw-play" | "resources" | "history";
const tabs: Record<ConsoleArea, readonly (readonly [string, string])[]> = {
  review: [["schedule", "일정 승인"], ["rejections", "거부 제외"]],
  collection: [["x", "X"], ["naver-cafe", "네이버 카페"], ["schedule", "일정 수집"], ["youtube", "YouTube 피드·캐시"], ["kirinuki", "키리누키 채널"]],
  content: [["notices", "공지"], ["ddays", "D-Day"], ["snapshot", "스냅샷"]],
  "otw-play": [["catalog", "카탈로그"], ["automatic-review", "자동 영상 후보"], ["review", "사용자 제안"], ["import", "가져오기 검토"], ["play-monitor", "채널 감시"], ["channels", "승인 채널"], ["source-health", "재생 상태"], ["operations", "공개 관리"]],
  resources: [["usage", "사용량·한도"], ["media", "이미지 정리"]],
  history: [["runs", "작업 실행"], ["schedule", "일정 변경"], ["audit", "관리자 감사"]],
};

export function ConsoleScreen({ area }: { area: ConsoleArea }) {
  const queryClient = useQueryClient();
  const [search, update] = useConsoleSearch();
  const wanted = area === "collection" ? search.source : search.tab;
  const tab = tabs[area].some(([key]) => key === wanted) ? wanted! : tabs[area][0][0];
  const select = (next: string) => update({ ...(area === "collection" ? { source: next } : { tab: next, source: undefined }), sort: undefined, pageSize: undefined, q: undefined, state: undefined, category: undefined, page: undefined, selected: undefined, from: undefined, until: undefined }, false);
  let content;
  if (area === "review") {
    content = <AutoUpdateSettingsManager activeTab={tab === "schedule" ? "review" : "rejections"} />;
  } else if (area === "collection") {
    content = tab === "x" || tab === "naver-cafe" ? <MemberPostSettingsManager activeSource={tab} onActiveSourceChange={select} /> : tab === "schedule" ? <AutoUpdateSettingsManager activeTab="settings" /> : tab === "youtube" ? <YouTubeCacheManager /> : <KirinukiChannelManager />;
  } else if (area === "content") {
    const date = search.date && /^\d{4}-\d{2}-\d{2}$/.test(search.date) && isValid(parseISO(search.date)) && format(parseISO(search.date), "yyyy-MM-dd") === search.date ? search.date : format(new Date(), "yyyy-MM-dd");
    content = tab === "notices" ? <NoticeManager /> : tab === "ddays" ? <DDayManager /> : <SnapshotPreviewManager date={date} mode={search.mode ?? "grid"} theme={search.theme ?? "light"} onDateChange={(date) => update({ date })} onModeChange={(mode) => update({ mode })} onThemeChange={(theme) => update({ theme })} />;
  } else if (area === "otw-play") {
    content = <OtwPlayCatalogManager activeSection={tab === "play-monitor" ? "automatic-review" : tab as "catalog" | "automatic-review" | "review" | "import" | "channels" | "source-health" | "operations"} onSectionChange={select} monitorMode={tab === "play-monitor" ? "sources" : "review"} />;
  } else if (area === "history") {
    content = tab === "runs" ? <OperationsDashboard view="history" /> : <AutoUpdateLogsManager view={tab === "audit" ? "audit" : "schedule"} />;
  } else {
    content = tab === "media" ? <NoticeManager view="resources" /> : <><ResourceBudgets /><OperationsDashboard view="resources" onRefresh={() => { void queryClient.refetchQueries({queryKey: xReferenceHealthQueryKey, type: "active"}); void queryClient.refetchQueries({queryKey: queryKeys.youtubeCache.all, type: "active"}); }} /></>;
  }
  return <div className="space-y-3"><nav aria-label="업무 선택" className="console-tabs flex flex-wrap gap-1 border-b pb-2">{tabs[area].map(([key, label]) => <button key={key} aria-current={tab === key ? "page" : undefined} className={`rounded-md px-3 py-2 text-sm ${tab === key ? "bg-primary text-primary-foreground font-semibold" : "hover:bg-muted text-muted-foreground"}`} onClick={() => select(key)}>{label}</button>)}</nav><div key={tab}>{content}</div></div>;
}
