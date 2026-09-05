import { readRecordedChanges } from "../../model/recorded-changes";
import { fetchActiveMembers } from "@/features/members";
import { useConsoleSearch } from "@/shared/lib/admin-console-search";
import { QueryReadback } from "@/shared/ui/query-readback";
import { Input } from "@/shared/ui/input";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  fetchAdminAuditLogs,
  fetchUpdateLogs,
} from "../../api/audit";
import type {
  AdminAuditLog,
  UpdateLog,
} from "../../model/types";
import { useToast } from "@/shared/ui/toast";
import { AdminSectionHeader } from "@/app/admin";
import { queryKeys } from "@/shared/query/query-keys";

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

const ACTION_BADGE_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  create: "default",
  update: "secondary",
  delete: "destructive",
  approve: "default",
  reject: "destructive",
  reopen_rejection: "outline",
  candidate_obsolete: "outline",
  reset_processed: "outline",
  auto_collected: "outline",
  auto_updated: "secondary",
  schedule_auto_created: "default",
  schedule_auto_updated: "secondary",
  auto_failed: "destructive",
};

const AUDIT_EVENT_LABELS: Record<string, string> = {
  "settings.update": "설정 변경",
  "live_schedule.auto_fill": "라이브 일정 반영",
  "manual_auto_update.run": "일정 수집 실행",
  "x.post_redacted": "X 게시물 공개 제외",
  "naver_cafe.post_redacted": "카페 게시물 공개 제외",
  "otw_play.catalog_entry.created": "Play 곡·가창 등록",
  "otw_play.song.created": "Play 곡 등록",
  "otw_play.song.updated": "Play 곡 수정",
  "otw_play.performance.created": "Play 가창 등록",
  "otw_play.performance.updated": "Play 가창 수정",
  "manual_collection.auto_update": "수동 자동 업데이트",
  "manual_collection.x": "수동 X 수집",
  "manual_collection.youtube_warmup": "수동 YouTube 캐시 새로고침",
  "manual_collection.youtube_cache_refresh": "수동 YouTube 캐시 새로고침",
  "manual_collection.naver_cafe_check": "수동 카페 점검",
  "pending.bulk_approve": "일괄 승인",
  "pending.bulk_reject": "일괄 거부",
};

const AUDIT_RESOURCE_LABELS: Record<string, string> = {
  settings: "설정", schedule: "일정", auto_update: "일정 수집", x_collection: "X 수집", x_post: "X 게시물",
  youtube_cache: "YouTube 캐시", naver_cafe: "네이버 카페", naver_cafe_post: "카페 게시물",
  data_retention: "보존·정리", pending_schedules: "일정 후보", music_song: "Play 곡",
  music_performance: "Play 가창", music_entity: "Play 가수·주체", music_channel: "Play 채널",
};

const AUDIT_STATUS_LABELS: Record<AdminAuditLog["status"], string> = {
  success: "성공",
  partial: "부분 성공",
  failed: "실패",
  skipped: "건너뜀",
};

const AUDIT_STATUS_BADGE_VARIANTS: Record<
  AdminAuditLog["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  success: "default",
  partial: "secondary",
  failed: "destructive",
  skipped: "outline",
};

const LOG_PAGE_SIZE_OPTIONS = [50, 100, 200] as const;
const AUDIT_LOG_PAGE_SIZE = 50;

const LOG_SORT_OPTIONS = [
  { value: "created_desc", label: "생성일 최신순" },
  { value: "created_asc", label: "생성일 오래된순" },
  { value: "schedule_desc", label: "스케줄 날짜 최신순" },
  { value: "schedule_asc", label: "스케줄 날짜 오래된순" },
  { value: "action_asc", label: "액션 오름차순" },
] as const;

type LogSortKey = (typeof LOG_SORT_OPTIONS)[number]["value"];

export function AutoUpdateLogsManager({ view = "all" }: { view?: "all" | "schedule" | "audit" } = {}) {
  const { toast } = useToast();
  const [search, updateSearch] = useConsoleSearch();
  const filters = {q: search.q, action: search.category, status: search.state, target: search.source, from: search.from, until: search.until};
  const membersQuery = useQuery({queryKey: queryKeys.members.active(), queryFn: fetchActiveMembers, enabled: view !== "audit", staleTime: 60_000});
  const pageSize = search.pageSize ?? 50;
  const setPageSize = (pageSize: number) => updateSearch({pageSize, page: 1});
  const sortKey = LOG_SORT_OPTIONS.find((item) => item.value === search.sort)?.value ?? "created_desc";
  const setSortKey = (sort: LogSortKey) => updateSearch({sort});
  const page = search.page ?? 1;
  const setPage = (next: number | ((previous: number) => number)) => updateSearch({page: typeof next === "function" ? next(page) : next}, false);
  const setSelectedLog = (log: UpdateLog | null) => updateSearch({selected: log ? `schedule:${log.id}` : undefined}, false);
  const auditPage = page;
  const setAuditPage = setPage;
  const setSelectedAuditLog = (log: AdminAuditLog | null) => updateSearch({selected: log ? `audit:${log.id}` : undefined}, false);

  const logQueryOptions = { ...filters, page, pageSize, sort: sortKey };
  const logsQuery = useQuery({
    queryKey: queryKeys.settings.logs(logQueryOptions),
    queryFn: () => fetchUpdateLogs(logQueryOptions),
    enabled: view !== "audit",
  });
  const auditLogQueryOptions = {...filters, page: auditPage, pageSize: AUDIT_LOG_PAGE_SIZE};
  const auditLogsQuery = useQuery({
    queryKey: queryKeys.settings.auditLogs(auditLogQueryOptions),
    queryFn: () => fetchAdminAuditLogs(auditLogQueryOptions),
    enabled: view !== "schedule",
  });
  const logs = Array.isArray(logsQuery.data?.items)
    ? logsQuery.data.items
    : [];
  const auditLogs = Array.isArray(auditLogsQuery.data?.items)
    ? auditLogsQuery.data.items
    : [];
  const selectedLog = logs.find((log) => `schedule:${log.id}` === search.selected) ?? null;
  const selectedAuditLog = auditLogs.find((log) => `audit:${log.id}` === search.selected) ?? null;
  const recordedChanges = readRecordedChanges(selectedAuditLog?.detail ?? null);
  const totalCount = logsQuery.data?.total ?? 0;
  const totalPages = logsQuery.data?.totalPages ?? 1;
  const auditTotalCount = auditLogsQuery.data?.total ?? 0;
  const auditTotalPages = auditLogsQuery.data?.totalPages ?? 1;
  const isLoading = logsQuery.isFetching;
  const isAuditLoading = auditLogsQuery.isFetching;
  const errorMessage = logsQuery.error
    ? "로그를 불러오지 못했습니다. 잠시 후 다시 시도해주세요."
    : null;
  const auditErrorMessage = auditLogsQuery.error
    ? "감사 로그를 불러오지 못했습니다. 잠시 후 다시 시도해주세요."
    : null;

  useEffect(() => {
    if (!logsQuery.error) return;
    console.error("Failed to load logs:", logsQuery.error);
    toast({
      variant: "error",
      description: "로그를 불러오지 못했습니다.",
    });
  }, [logsQuery.error, toast]);

  useEffect(() => {
    if (!auditLogsQuery.error) return;
    console.error("Failed to load admin audit logs:", auditLogsQuery.error);
    toast({
      variant: "error",
      description: "감사 로그를 불러오지 못했습니다.",
    });
  }, [auditLogsQuery.error, toast]);

  const formatLogDate = (timestamp: string | null): string => {
    if (!timestamp) return "-";
    const date = new Date(timestamp);
    return date.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const getActorLabel = (log: UpdateLog) => {
    if (log.actor_name) return log.actor_name;
    if (log.actor_id) return "등록 사용자";
    if (log.actor_ip) return "비회원";
    return "-";
  };

  const getAuditActorLabel = (log: AdminAuditLog) => {
    if (log.actor_name) return log.actor_name;
    if (log.actor_id) return "관리자";
    if (log.actor_ip) return "관리자";
    return "-";
  };

  const getAuditResultSummary = (log: AdminAuditLog) => {
    const total = log.target_count ?? 0;
    const success = log.success_count ?? 0;
    const failure = log.failure_count ?? 0;
    if (total > 0) return `${success}/${total} 성공 · 실패 ${failure}`;
    return failure > 0 ? `실패 ${failure}` : "-";
  };

  const formatAuditDate = (timestamp: number): string => {
    if (!Number.isFinite(timestamp)) return "-";
    return formatLogDate(new Date(timestamp).toISOString());
  };

  const formatAuditDetail = (detail: string | null) => {
    if (!detail) return "-";
    try {
      return JSON.stringify(JSON.parse(detail), null, 2);
    } catch {
      return detail;
    }
  };

  const handleManualRefresh = () => {
    void logsQuery.refetch();
  };

  const handleAuditRefresh = () => {
    void auditLogsQuery.refetch();
  };



  return (
    <section className="space-y-4">
      <AdminSectionHeader
        title={view === "audit" ? "관리자 감사 기록" : "일정 변경 기록"}
        description="스케줄 변경 이력과 자동 수집 처리 결과를 확인합니다."
        count={view === "audit" ? auditLogsQuery.data?.total : logsQuery.data?.total}
      />

      <div className="flex flex-wrap gap-2 rounded border p-2">
        <Input className="w-60" aria-label="기록 검색" placeholder="내용·이름 검색" value={search.q ?? ""} onChange={(e) => updateSearch({q: e.target.value, page: 1})} />
        <select aria-label="행동 필터" className="rounded border bg-background p-2" value={search.category ?? ""} onChange={(e) => updateSearch({category: e.target.value, page: 1})}><option value="">모든 행동</option>{Object.entries(view === "audit" ? {update: "설정 변경", run_now: "수집 실행", refresh_all: "전체 채널 갱신", check_now: "카페 점검", redact: "공개 제외", dry_run: "정리 사전 확인", prune: "보존 기간 정리", approve: "승인", reject: "거부"} : ACTION_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
        {view === "audit" && <select aria-label="결과 필터" className="rounded border bg-background p-2" value={search.state ?? ""} onChange={(e) => updateSearch({state: e.target.value, page: 1})}><option value="">모든 결과</option>{Object.entries(AUDIT_STATUS_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>}
        <select aria-label="대상 필터" className="rounded border bg-background p-2" value={search.source ?? ""} onChange={(e) => updateSearch({source: e.target.value, page: 1})}><option value="">모든 대상</option>{view === "audit" ? Object.entries(AUDIT_RESOURCE_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>) : (membersQuery.data ?? []).map((member) => <option key={member.uid} value={String(member.uid)}>{member.name}</option>)}</select>
        <label className="text-xs">시작일 UTC<Input type="date" value={search.from ?? ""} onChange={(e) => updateSearch({from: e.target.value, page: 1})}/></label><label className="text-xs">종료일 UTC<Input type="date" value={search.until ?? ""} onChange={(e) => updateSearch({until: e.target.value, page: 1})}/></label>
        <Button variant="outline" onClick={() => updateSearch({q: undefined, category: undefined, state: undefined, source: undefined, from: undefined, until: undefined, page: 1})}>조건 초기화</Button>
      </div>
      <QueryReadback updatedAt={view === "audit" ? auditLogsQuery.dataUpdatedAt : logsQuery.dataUpdatedAt} fetching={view === "audit" ? isAuditLoading : isLoading} error={view === "audit" ? auditLogsQuery.isError : logsQuery.isError} />
      {view !== "audit" && (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <CardTitle className="text-base">로그 목록</CardTitle>
              <CardDescription className="mt-1">
                로그를 클릭하면 상세 내용을 확인할 수 있습니다.
              </CardDescription>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[180px_160px_auto]">
              <div className="space-y-1">
                <Label htmlFor="log-sort">정렬</Label>
                <Select
                  value={sortKey}
                  onValueChange={(value) => { setSortKey(value as LogSortKey); setPage(1); }}
                >
                  <SelectTrigger id="log-sort">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOG_SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="log-limit">표시 개수</Label>
                <Select
                  value={String(pageSize)}
                  onValueChange={(value) => setPageSize(Number(value))}
                >
                  <SelectTrigger id="log-limit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOG_PAGE_SIZE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option}건/페이지
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                className="self-end"
                aria-label="업데이트 로그 새로고침"
                onClick={handleManualRefresh}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                새로고침
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              로그 불러오는 중...
            </div>
          ) : errorMessage ? (
            <div className="text-center py-8 text-destructive">{errorMessage}</div>
          ) : totalCount === 0 ? (
            <div className="text-center py-8 text-muted-foreground">기록이 없습니다.</div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border overflow-hidden">
                <Table className="w-full console-history-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[160px]">생성일</TableHead>
                      <TableHead>멤버</TableHead>
                      <TableHead className="w-[180px]">수정 주체</TableHead>
                      <TableHead className="w-[120px]">스케줄 날짜</TableHead>
                      <TableHead className="w-[140px]">액션</TableHead>
                      <TableHead>제목</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow
                        key={log.id}
                        className="cursor-pointer hover:bg-muted/40"
                        tabIndex={0}
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedLog(log); } }}
                        onClick={() => setSelectedLog(log)}
                      >
                        <TableCell className="text-xs text-muted-foreground">
                          {formatLogDate(log.created_at)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {log.member_name || "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {getActorLabel(log)}
                        </TableCell>
                        <TableCell className="text-sm">{log.schedule_date}</TableCell>
                        <TableCell>
                          <Badge
                            variant={ACTION_BADGE_VARIANTS[log.action] || "outline"}
                            className="text-xs"
                          >
                            {ACTION_LABELS[log.action] || log.action}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className="max-w-[280px] whitespace-normal text-sm"
                          title={log.title || ""}
                        >
                          {log.title || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  총 {totalCount}건, {page}/{totalPages} 페이지
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setPage(1)}
                    disabled={page <= 1}
                    aria-label="첫 페이지"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={page <= 1}
                    aria-label="이전 페이지"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={page >= totalPages}
                    aria-label="다음 페이지"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setPage(totalPages)}
                    disabled={page >= totalPages}
                    aria-label="마지막 페이지"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      )}
      {view !== "schedule" && (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="text-base">관리자 감사 로그</CardTitle>
              <CardDescription className="mt-1">
                설정 변경, 수동 수집, 일괄 승인/거부 실행 주체를 확인합니다.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              aria-label="감사 로그 새로고침"
              onClick={handleAuditRefresh}
              disabled={isAuditLoading}
            >
              {isAuditLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              새로고침
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isAuditLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              감사 로그 불러오는 중...
            </div>
          ) : auditErrorMessage ? (
            <div className="py-8 text-center text-destructive">
              {auditErrorMessage}
            </div>
          ) : auditTotalCount === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              기록이 없습니다.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-md border">
                <Table className="w-full console-history-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[160px]">발생 시각</TableHead>
                      <TableHead className="w-[190px]">이벤트</TableHead>
                      <TableHead className="w-[110px]">상태</TableHead>
                      <TableHead className="w-[150px]">대상</TableHead>
                      <TableHead className="w-[180px]">실행 주체</TableHead>
                      <TableHead>결과</TableHead>
                      <TableHead>오류</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.map((log) => (
                      <TableRow
                        key={log.id}
                        className="cursor-pointer hover:bg-muted/40"
                        tabIndex={0}
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedAuditLog(log); } }}
                        onClick={() => setSelectedAuditLog(log)}
                      >
                        <TableCell className="text-xs text-muted-foreground">
                          {formatAuditDate(log.created_at)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {AUDIT_EVENT_LABELS[log.event_type] ?? "기타 관리자 작업"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={AUDIT_STATUS_BADGE_VARIANTS[log.status]}
                            className="text-xs"
                          >
                            {AUDIT_STATUS_LABELS[log.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {AUDIT_RESOURCE_LABELS[log.resource_type] ?? "기타 대상"}

                        </TableCell>
                        <TableCell className="text-sm">
                          {getAuditActorLabel(log)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {getAuditResultSummary(log)}
                        </TableCell>
                        <TableCell
                          className="max-w-[220px] truncate text-sm text-destructive"
                          title={log.error ?? ""}
                        >
                          {log.error ?? "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  총 {auditTotalCount}건, {auditPage}/{auditTotalPages} 페이지
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setAuditPage(1)}
                    disabled={auditPage <= 1}
                    aria-label="감사 로그 첫 페이지"
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={() =>
                      setAuditPage((prev) => Math.max(1, prev - 1))
                    }
                    disabled={auditPage <= 1}
                    aria-label="감사 로그 이전 페이지"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={() =>
                      setAuditPage((prev) =>
                        Math.min(auditTotalPages, prev + 1),
                      )
                    }
                    disabled={auditPage >= auditTotalPages}
                    aria-label="감사 로그 다음 페이지"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setAuditPage(auditTotalPages)}
                    disabled={auditPage >= auditTotalPages}
                    aria-label="감사 로그 마지막 페이지"
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      <Dialog
        open={Boolean(selectedLog)}
        onOpenChange={(open) => !open && setSelectedLog(null)}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>로그 상세</DialogTitle>
            <DialogDescription>선택한 로그의 상세 정보입니다.</DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">액션</span>
                <Badge
                  variant={ACTION_BADGE_VARIANTS[selectedLog.action] || "outline"}
                  className="text-xs"
                >
                  {ACTION_LABELS[selectedLog.action] || selectedLog.action}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">멤버</span>
                <span className="font-medium">
                  {selectedLog.member_name || "-"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">수정 주체</span>
                <span className="font-medium">{getActorLabel(selectedLog)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">스케줄 날짜</span>
                <span>{selectedLog.schedule_date}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">생성 시각</span>
                <span>{formatLogDate(selectedLog.created_at)}</span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-muted-foreground">제목</span>
                <span className="text-right break-words max-w-[60%]">
                  {selectedLog.title || "-"}
                </span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-muted-foreground">이전 상태</span>
                <span>{selectedLog.previous_status || "기록 없음"}</span>
              </div>
              {selectedLog.vod_id ? (
                <div className="flex items-start justify-between gap-2">
                  <span className="text-muted-foreground">VOD ID</span>
                  <code className="max-w-[60%] break-all text-right text-xs">
                    {selectedLog.vod_id}
                  </code>
                </div>
              ) : null}
              {selectedLog.reason_code ? (
                <div className="flex items-start justify-between gap-2">
                  <span className="text-muted-foreground">거부 사유</span>
                  <span className="text-right">
                    {selectedLog.reason_code}
                    {selectedLog.reason_note
                      ? ` · ${selectedLog.reason_note}`
                      : ""}
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedAuditLog)}
        onOpenChange={(open) => !open && setSelectedAuditLog(null)}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>감사 로그 상세</DialogTitle>
            <DialogDescription>
              선택한 관리자 행위 감사 로그의 상세 정보입니다.
            </DialogDescription>
          </DialogHeader>
          {selectedAuditLog && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">이벤트</span>
                <span className="font-medium">
                  {AUDIT_EVENT_LABELS[selectedAuditLog.event_type] ??
                    selectedAuditLog.event_type}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">상태</span>
                <Badge
                  variant={
                    AUDIT_STATUS_BADGE_VARIANTS[selectedAuditLog.status]
                  }
                  className="text-xs"
                >
                  {AUDIT_STATUS_LABELS[selectedAuditLog.status]}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">실행 주체</span>
                <span className="font-medium">
                  {getAuditActorLabel(selectedAuditLog)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">대상</span>
                <span>
                  {selectedAuditLog.resource_type}
                  {selectedAuditLog.resource_id
                    ? `:${selectedAuditLog.resource_id}`
                    : ""}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">발생 시각</span>
                <span>{formatAuditDate(selectedAuditLog.created_at)}</span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-muted-foreground">결과</span>
                <span>{getAuditResultSummary(selectedAuditLog)}</span>
              </div>
              {selectedAuditLog.error ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive">
                  {selectedAuditLog.error}
                </div>
              ) : null}
              {recordedChanges.length > 0 && <section aria-label="기록된 변경 전후" className="rounded border p-3"><h3 className="mb-2 font-semibold">변경 전후</h3>{recordedChanges.map((change, index) => <div key={`${change.key}-${index}`} className="space-y-1 border-t py-2 first:border-t-0"><p className="break-all font-medium">{({x_collection_daily_budget_cents: "X 전체 일일 예산 (센트)", x_reference_preview_daily_budget_cents: "원문 보강 일일 한도 (센트)", x_collection_interval_hours: "X 수집 주기 (시간)", x_reference_preview_mode: "원문 보강 모드", youtube_daily_quota_limit: "YouTube 일일 쿼터"} as Record<string,string>)[change.key] ?? change.key}</p><dl className="grid grid-cols-2 gap-3"><div><dt className="text-xs text-muted-foreground">변경 전</dt><dd className="break-all">{change.before}</dd></div><div><dt className="text-xs text-muted-foreground">변경 후</dt><dd className="break-all">{change.after}</dd></div></dl></div>)}</section>}
              <details className="rounded border p-2"><summary>실행 주체·기술 정보</summary><dl className="mt-2 space-y-1 break-all"><dt>사용자 ID</dt><dd>{selectedAuditLog.actor_id ?? "기록 없음"}</dd><dt>IP</dt><dd>{selectedAuditLog.actor_ip ?? "기록 없음"}</dd><dt>이벤트</dt><dd>{selectedAuditLog.event_type}</dd></dl></details>
              <div className="space-y-1">
                <span className="text-muted-foreground">기록된 상세</span>
                <pre className="max-h-64 overflow-auto rounded-md border bg-muted/30 p-3 text-xs">
                  {formatAuditDetail(selectedAuditLog.detail)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
