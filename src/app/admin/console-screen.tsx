import { SelectField } from "@/shared/ui/select-field";
import { Link } from "@tanstack/react-router";
import { SectionNavigation, sectionNavigationItemClassName } from "@/shared/ui/section-navigation";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/query/query-keys";
import { xReferenceHealthQueryKey } from "@/features/member-posts";
import { format, isValid, parseISO } from "date-fns";
import { AutoUpdateSettingsManager } from "@/features/configuration";
import { MemberPostSettingsManager } from "@/features/member-posts";
import { OtwPlayCatalogManager, OtwPlayDefaultPlaylistManager } from "@/features/otw-play";
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
  collection: [["x", "X"], ["naver-cafe", "네이버 카페"], ["schedule", "일정 수집"], ["youtube", "YouTube 피드·캐시"], ["kirinuki", "방송 클립 채널"]],
  content: [["notices", "공지"], ["ddays", "D-Day"], ["snapshot", "스냅샷"]],
  "otw-play": [["catalog", "카탈로그"], ["import", "가져오기/검수"], ["channels", "채널"], ["playlists", "기본 플레이리스트"], ["operations", "운영"]],
  resources: [["usage", "사용량·한도"], ["media", "이미지 정리"]],
  history: [["runs", "작업 실행"], ["schedule", "일정 변경"], ["audit", "관리자 감사"]],
};

export function ConsoleScreen({ area }: { area: ConsoleArea }) {
  const queryClient = useQueryClient();
  const [search, update] = useConsoleSearch();
  const wanted = area === "collection" ? search.source
    : area === "otw-play" && ["automatic-review", "review"].includes(search.tab ?? "") ? "import"
    : area === "otw-play" && ["play-monitor", "clip-channels"].includes(search.tab ?? "") ? "channels"
    : area === "otw-play" && search.tab === "source-health" ? "operations"
    : area === "otw-play" && search.tab === "clips" ? "catalog"
    : search.tab;
  const tab = tabs[area].some(([key]) => key === wanted) ? wanted! : tabs[area][0][0];
  const searchForTab = (next: string) => ({ ...search, ...(area === "collection" ? { source: next } : { tab: next, source: undefined }), channel: undefined, channelKind: undefined, sort: undefined, pageSize: undefined, q: undefined, state: undefined, category: undefined, page: undefined, selected: undefined, proposal: undefined, view: undefined, kind: undefined, from: undefined, until: undefined });
  const select = (next: string) => update(searchForTab(next), false);
  let content;
  if (area === "review") {
    content = <AutoUpdateSettingsManager activeTab={tab === "schedule" ? "review" : "rejections"} />;
  } else if (area === "collection") {
    content = tab === "x" || tab === "naver-cafe" ? <MemberPostSettingsManager activeSource={tab} onActiveSourceChange={select} /> : tab === "schedule" ? <AutoUpdateSettingsManager activeTab="settings" /> : tab === "youtube" ? <YouTubeCacheManager /> : <KirinukiChannelManager />;
  } else if (area === "content") {
    const date = search.date && /^\d{4}-\d{2}-\d{2}$/.test(search.date) && isValid(parseISO(search.date)) && format(parseISO(search.date), "yyyy-MM-dd") === search.date ? search.date : format(new Date(), "yyyy-MM-dd");
    content = tab === "notices" ? <NoticeManager /> : tab === "ddays" ? <DDayManager /> : <SnapshotPreviewManager date={date} mode={search.mode ?? "grid"} theme={search.theme ?? "light"} design={search.design ?? "poster"} onDesignChange={(design) => update({ design })} onDateChange={(date) => update({ date })} onModeChange={(mode) => update({ mode })} onThemeChange={(theme) => update({ theme })} />;
  } else if (area === "otw-play") {
    content = tab === "playlists" ? <OtwPlayDefaultPlaylistManager /> : <OtwPlayCatalogManager activeSection={tab as "clips" | "clip-channels" | "catalog" | "automatic-review" | "review" | "import" | "requests" | "channels" | "source-health" | "operations"} onSectionChange={select} />;
  } else if (area === "history") {
    content = tab === "runs" ? <OperationsDashboard view="history" /> : <AutoUpdateLogsManager view={tab === "audit" ? "audit" : "schedule"} />;
  } else {
    content = tab === "media" ? <NoticeManager view="resources" /> : <><ResourceBudgets /><OperationsDashboard view="resources" onRefresh={() => { void queryClient.refetchQueries({queryKey: xReferenceHealthQueryKey, type: "active"}); void queryClient.refetchQueries({queryKey: queryKeys.youtubeCache.all, type: "active"}); }} /></>;
  }
  return <div className={area === "otw-play" ? "otw-play-console min-w-0 space-y-3" : "space-y-3"}>
    <div className="md:hidden"><label className="text-xs text-muted-foreground">현재 화면<SelectField aria-label="관리자 하위 화면" className="mt-1 w-full" value={tab} onValueChange={select} options={tabs[area].map(([value, label]) => ({ value, label }))} /></label></div>
    <SectionNavigation label="업무 선택" className="console-tabs hidden md:flex">
      {tabs[area].map(([key, label]) => <Link key={key} to="." search={searchForTab(key)} resetScroll={false}
        aria-current={tab === key ? "page" : undefined} className={sectionNavigationItemClassName}>{label}</Link>)}
    </SectionNavigation><div>{content}</div>
  </div>;
}
