import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  PiArrowsClockwiseBold,
  PiCaretDownBold,
  PiCaretLeftBold,
  PiCaretRightBold,
  PiCaretDoubleLeftBold,
  PiCaretDoubleRightBold,
} from "react-icons/pi";
import { AdminSectionHeader } from "@/app/admin";
import { fetchAdminMembers } from "@/features/members";
import { useConsoleSearch, type ConsoleSearch } from "@/shared/lib/admin-console-search";
import { formatHistoryDate } from "@/shared/lib/history-date";
import { queryKeys } from "@/shared/query/query-keys";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { QueryReadback } from "@/shared/ui/query-readback";
import { SelectField } from "@/shared/ui/select-field";
import { fetchUpdateLogs } from "../../api/audit";
import type { UpdateLog } from "../../model/types";

const ACTION_LABELS: Record<string, string> = {
  create: "수동 생성",
  update: "수동 수정",
  delete: "삭제",
  approve: "승인",
  reject: "거부",
  reopen_rejection: "재검토 허용",
  candidate_obsolete: "만료 후보 정리",
  reset_processed: "처리 표시 리셋",
  auto_collected: "자동 수집",
  auto_updated: "자동 업데이트",
  schedule_auto_created: "자동 일정 생성",
  schedule_auto_updated: "자동 일정 수정",
  auto_failed: "자동 업데이트 실패",
};

const ACTION_BADGE_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  create: "default",
  update: "secondary",
  delete: "destructive",
  approve: "default",
  reject: "destructive",
  auto_updated: "secondary",
  schedule_auto_created: "default",
  schedule_auto_updated: "secondary",
  auto_failed: "destructive",
};

const LOG_PAGE_SIZE_OPTIONS = [50, 100, 200] as const;
const LOG_SORT_OPTIONS = [
  { value: "created_desc", label: "기록 시각 최신순" },
  { value: "created_asc", label: "기록 시각 오래된순" },
  { value: "schedule_desc", label: "일정 날짜 최신순" },
  { value: "schedule_asc", label: "일정 날짜 오래된순" },
  { value: "action_asc", label: "변경 유형 오름차순" },
] as const;

function ScheduleHistoryRow({ log, open, onToggle }: { log: UpdateLog; open: boolean; onToggle: () => void }) {
  const panelId = useId();
  const title = log.title || "제목 없음";
  const actor = log.actor_name || (log.actor_id ? "등록 사용자" : log.actor_ip ? "비회원" : "기록 없음");

  return (
    <li className="min-w-0">
      <div className="grid items-center gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_auto]">
        <div className="min-w-0 space-y-1.5">
          <h3 className="text-sm font-semibold [overflow-wrap:anywhere]">{title}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={ACTION_BADGE_VARIANTS[log.action] || "outline"}>{ACTION_LABELS[log.action] || log.action}</Badge>
            <span className="text-xs text-muted-foreground">{log.member_name || "멤버 미기록"}</span>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-1 text-xs tabular-nums lg:grid-cols-1 [&>div]:flex [&>div]:flex-wrap [&>div]:gap-x-2">
          <div><dt className="text-muted-foreground">일정</dt><dd>{log.schedule_date || "기록 없음"}</dd></div>
          <div><dt className="text-muted-foreground">기록</dt><dd>{formatHistoryDate(log.created_at)}</dd></div>
        </dl>
        <Button variant={open ? "secondary" : "outline"} size="sm" className="min-h-11 w-fit md:min-h-9" aria-controls={panelId} aria-expanded={open} aria-label={title + " " + (open ? "상세 닫기" : "상세 보기")} onClick={onToggle}>
          {open ? "상세 닫기" : "상세 보기"}<PiCaretDownBold className={open ? "rotate-180" : undefined} aria-hidden="true" />
        </Button>
      </div>
      <div id={panelId} hidden={!open} className="space-y-2 border-t bg-background/50 px-4 py-3 text-sm [overflow-wrap:anywhere]">
        {open && <>
          <h4 className="font-semibold">변경 상세</h4>
          <dl className="grid gap-3 sm:grid-cols-2 [&_dt]:text-xs [&_dt]:text-muted-foreground">
            <div><dt>수정 주체</dt><dd>{actor}</dd></div>
            <div><dt>이전 상태</dt><dd>{log.previous_status || "기록 없음"}</dd></div>
            {log.vod_id && <div><dt>VOD ID</dt><dd>{log.vod_id}</dd></div>}
            {(log.reason_code || log.reason_note) && <div><dt>거부 사유</dt><dd>{[log.reason_code, log.reason_note].filter(Boolean).join(" · ")}</dd></div>}
          </dl>
        </>}
      </div>
    </li>
  );
}

export function AutoUpdateLogsManager() {
  const [search, updateSearch] = useConsoleSearch();
  const { q, category, state, source, from, until } = search;
  const page = search.page ?? 1;
  const pageSize = search.pageSize ?? 50;
  const sort = LOG_SORT_OPTIONS.find((item) => item.value === search.sort)?.value ?? "created_desc";
  const filters = { q, action: category, status: state, target: source, from, until };
  const hasFilters = Object.values(filters).some(Boolean);
  const applyFilters = (patch: Pick<ConsoleSearch, "q" | "category" | "state" | "source" | "from" | "until" | "sort" | "pageSize">) => updateSearch({ ...patch, page: 1, selected: undefined });
  const setPage = (next: number) => updateSearch({ page: next, selected: undefined }, false);
  const membersQuery = useQuery({ queryKey: queryKeys.members.admin(), queryFn: fetchAdminMembers, staleTime: 60_000 });
  const options = { ...filters, page, pageSize, sort };
  const query = useQuery({ queryKey: queryKeys.settings.logs(options), queryFn: () => fetchUpdateLogs(options) });
  const data = query.isError ? undefined : query.data;
  const logs = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;
  const firstPage = page <= 1;
  const lastPage = !data || page >= totalPages;
  const field = "min-h-11 w-full min-w-0 text-foreground md:min-h-9";
  const label = "grid min-w-0 gap-1 text-xs text-muted-foreground";

  return (
    <section className="min-w-0 space-y-4" aria-label="일정 변경 기록">
      <AdminSectionHeader title="일정 변경 기록" description="변경 유형과 대상 일정을 확인합니다. 기록 시각은 한국시간입니다." actions={
        <Button variant="outline" className="min-h-11 md:min-h-9" onClick={() => void query.refetch()} disabled={query.isFetching}>
          <PiArrowsClockwiseBold className={query.isFetching ? "animate-spin" : undefined} aria-hidden="true" /> 상태 새로고침
        </Button>
      } />
      <div role="search" aria-label="일정 변경 필터" className="space-y-3 rounded-xl border bg-card p-4">
        <div className="grid gap-2.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <label className={label}>내용·수정 주체<Input className={field} placeholder="제목, 멤버 이름, 수정 주체" maxLength={200} value={q ?? ""} onChange={(event) => applyFilters({ q: event.target.value || undefined })} /></label>
          <label className={label}>변경 유형<SelectField className={field} aria-label="변경 유형" value={category ?? ""} onValueChange={(value) => applyFilters({ category: value || undefined })} options={[{ value: "", label: "모든 변경 유형" }, ...Object.entries(ACTION_LABELS).map(([value, name]) => ({ value, label: name }))]} /></label>
        </div>
        <div className="relative border-t pt-1">
          <details className="group">
            <summary className={"flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium md:min-h-9" + (hasFilters ? " pr-24" : "")}>
              <PiCaretDownBold className="size-4 -rotate-90 motion-safe:transition-transform group-open:rotate-0" aria-hidden="true" /> 멤버·기간·보기 설정
              {(source || from || until || state || search.sort || search.pageSize) && <span className="text-xs text-muted-foreground">적용 중</span>}
            </summary>
            <div className="grid grid-cols-2 gap-2.5 pt-2 lg:grid-cols-5">
              <label className={label + " col-span-2 lg:col-span-1"}>멤버<SelectField className={field} aria-label="멤버" value={source ?? ""} onValueChange={(value) => applyFilters({ source: value || undefined })} options={[{ value: "", label: "모든 멤버" }, ...(membersQuery.data ?? []).map((member) => ({ value: String(member.uid), label: member.name }))]} /></label>
              <label className={label}>시작일 UTC<Input className={field} type="date" max={until} value={from ?? ""} onChange={(event) => applyFilters({ from: event.target.value || undefined })} /></label>
              <label className={label}>종료일 UTC<Input className={field} type="date" min={from} value={until ?? ""} onChange={(event) => applyFilters({ until: event.target.value || undefined })} /></label>
              <label className={label}>정렬<SelectField className={field} aria-label="정렬" value={sort} onValueChange={(value) => applyFilters({ sort: value })} options={LOG_SORT_OPTIONS} /></label>
              <label className={label}>표시 개수<SelectField className={field} aria-label="표시 개수" value={String(pageSize)} onValueChange={(value) => applyFilters({ pageSize: Number(value) })} options={LOG_PAGE_SIZE_OPTIONS.map((value) => ({ value: String(value), label: String(value) + "건/페이지" }))} /></label>
            </div>
          </details>
          {hasFilters && <Button variant="ghost" size="sm" className="absolute top-1 right-0 min-h-11 md:min-h-9" onClick={() => applyFilters({ q: undefined, category: undefined, state: undefined, source: undefined, from: undefined, until: undefined })}>필터 초기화</Button>}
        </div>
      </div>
      <QueryReadback updatedAt={query.dataUpdatedAt} fetching={query.isFetching} error={query.isError} className="my-0 px-1" />
      {query.isLoading && <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">일정 변경 기록을 불러오는 중…</p>}
      {data && (logs.length > 0
        ? <ul aria-label="일정 변경 목록" className="divide-y overflow-hidden rounded-xl border bg-card">{logs.map((log) => {
          const key = "schedule:" + log.id;
          return <ScheduleHistoryRow key={key} log={log} open={search.selected === key} onToggle={() => updateSearch({ selected: search.selected === key ? undefined : key }, false)} />;
        })}</ul>
        : <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{hasFilters ? "선택한 조건에 맞는 일정 변경 기록이 없습니다." : "아직 일정 변경 기록이 없습니다."}</p>)}
      {(logs.length > 0 || page > 1) && <nav aria-label="일정 변경 페이지" className="flex flex-wrap items-center justify-between gap-2 px-1">
        <span className="text-xs tabular-nums text-muted-foreground">{page}페이지{data && " · 총 " + data.total.toLocaleString("ko-KR") + "건"}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="icon-sm" className="size-11 md:size-9" aria-label="첫 페이지" disabled={firstPage} onClick={() => setPage(1)}><PiCaretDoubleLeftBold aria-hidden="true" /></Button>
          <Button variant="outline" size="icon-sm" className="size-11 md:size-9" aria-label="이전 페이지" disabled={firstPage} onClick={() => setPage(page - 1)}><PiCaretLeftBold aria-hidden="true" /></Button>
          <Button variant="outline" size="icon-sm" className="size-11 md:size-9" aria-label="다음 페이지" disabled={lastPage} onClick={() => setPage(page + 1)}><PiCaretRightBold aria-hidden="true" /></Button>
          <Button variant="outline" size="icon-sm" className="size-11 md:size-9" aria-label="마지막 페이지" disabled={lastPage} onClick={() => setPage(totalPages)}><PiCaretDoubleRightBold aria-hidden="true" /></Button>
        </div>
      </nav>}
    </section>
  );
}
