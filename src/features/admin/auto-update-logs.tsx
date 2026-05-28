import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ListFilter,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchUpdateLogs, type UpdateLog } from "@/lib/api/settings";
import { useToast } from "@/components/ui/toast";
import { AdminSectionHeader } from "./components/admin-section-header";

const ACTION_LABELS: Record<string, string> = {
  create: "수동 생성",
  update: "수동 수정",
  delete: "삭제",
  approve: "승인",
  reject: "거부",
  reset_processed: "처리 표시 리셋",
  auto_collected: "자동 수집",
  auto_updated: "자동 업데이트",
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
  reset_processed: "outline",
  auto_collected: "outline",
  auto_updated: "secondary",
  auto_failed: "destructive",
};

const ACTION_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "create", label: "수동 생성" },
  { value: "update", label: "수동 수정" },
  { value: "delete", label: "삭제" },
  { value: "approve", label: "승인" },
  { value: "reject", label: "거부" },
  { value: "reset_processed", label: "처리 표시 리셋" },
  { value: "auto_collected", label: "자동 수집" },
  { value: "auto_updated", label: "자동 업데이트" },
  { value: "auto_failed", label: "자동 업데이트 실패" },
];

type LogFilters = {
  action: string;
  member: string;
  dateFrom: string;
  dateTo: string;
  query: string;
};

const DEFAULT_FILTERS: LogFilters = {
  action: "all",
  member: "",
  dateFrom: "",
  dateTo: "",
  query: "",
};

const FILTER_DEBOUNCE_MS = 300;
const LOG_PAGE_SIZE_OPTIONS = [50, 100, 200] as const;

const LOG_SORT_OPTIONS = [
  { value: "created_desc", label: "생성일 최신순" },
  { value: "created_asc", label: "생성일 오래된순" },
  { value: "schedule_desc", label: "스케줄 날짜 최신순" },
  { value: "schedule_asc", label: "스케줄 날짜 오래된순" },
  { value: "action_asc", label: "액션 오름차순" },
] as const;

type LogSortKey = (typeof LOG_SORT_OPTIONS)[number]["value"];

export function AutoUpdateLogsManager() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<UpdateLog[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<LogFilters>(DEFAULT_FILTERS);
  const [debouncedFilters, setDebouncedFilters] =
    useState<LogFilters>(DEFAULT_FILTERS);
  const [pageSize, setPageSize] = useState<number>(50);
  const [sortKey, setSortKey] = useState<LogSortKey>("created_desc");
  const [page, setPage] = useState(1);
  const [dateRangeError, setDateRangeError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<UpdateLog | null>(null);

  const loadLogs = useCallback(
    async (
      activeFilters: LogFilters,
      pageNo: number,
      size: number,
      sort: LogSortKey,
    ) => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await fetchUpdateLogs({
          page: pageNo,
          pageSize: size,
          sort,
          action:
            activeFilters.action === "all" ? undefined : activeFilters.action,
          member: activeFilters.member.trim() || undefined,
          dateFrom: activeFilters.dateFrom || undefined,
          dateTo: activeFilters.dateTo || undefined,
          query: activeFilters.query.trim() || undefined,
        });
        setLogs(Array.isArray(data.items) ? data.items : []);
        setTotalCount(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
        if ((data.totalPages ?? 1) < pageNo) {
          setPage(data.totalPages ?? 1);
        }
      } catch (error) {
        console.error("Failed to load logs:", error);
        setErrorMessage("로그를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
        setLogs([]);
        setTotalCount(0);
        setTotalPages(1);
        toast({
          variant: "error",
          description: "로그를 불러오지 못했습니다.",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (
      filters.dateFrom &&
      filters.dateTo &&
      filters.dateFrom > filters.dateTo
    ) {
      setDateRangeError("종료 날짜는 시작 날짜와 같거나 이후여야 합니다.");
      return;
    }
    setDateRangeError(null);

    const timer = setTimeout(() => {
      setDebouncedFilters(filters);
    }, FILTER_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [filters]);

  useEffect(() => {
    if (dateRangeError) return;
    void loadLogs(debouncedFilters, page, pageSize, sortKey);
  }, [debouncedFilters, dateRangeError, loadLogs, page, pageSize, sortKey]);

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
    if (log.actor_id) return log.actor_id;
    if (log.actor_ip) return `비회원 (${log.actor_ip})`;
    return "-";
  };

  const handleReset = () => {
    setFilters(DEFAULT_FILTERS);
    setDebouncedFilters(DEFAULT_FILTERS);
    setDateRangeError(null);
  };

  const hasActiveFilters = useMemo(
    () =>
      filters.action !== "all" ||
      filters.member.trim() !== "" ||
      filters.dateFrom !== "" ||
      filters.dateTo !== "" ||
      filters.query.trim() !== "",
    [filters],
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.action !== "all") count += 1;
    if (filters.member.trim() !== "") count += 1;
    if (filters.dateFrom !== "" || filters.dateTo !== "") count += 1;
    if (filters.query.trim() !== "") count += 1;
    return count;
  }, [filters]);

  const handleManualRefresh = () => {
    if (dateRangeError) {
      toast({
        variant: "error",
        description: dateRangeError,
      });
      return;
    }
    void loadLogs(debouncedFilters, page, pageSize, sortKey);
  };

  useEffect(() => {
    setPage(1);
  }, [debouncedFilters, pageSize, sortKey]);

  return (
    <section className="space-y-4">
      <AdminSectionHeader
        title="스케줄 업데이트 로그"
        description="스케줄 변경 이력과 자동 수집 처리 결과를 확인합니다."
        count={totalCount}
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <ListFilter className="h-4 w-4" />
                로그 필터
              </CardTitle>
              <CardDescription className="mt-1">
                조건을 변경하면 목록이 자동으로 갱신됩니다.
              </CardDescription>
            </div>
            <Badge variant={hasActiveFilters ? "default" : "outline"}>
              {hasActiveFilters ? `필터 ${activeFilterCount}개` : "전체 로그"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12">
            <div className="space-y-1 xl:col-span-4">
              <Label htmlFor="log-query">검색어</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="log-query"
                  className="pl-9"
                  placeholder="제목 또는 멤버명"
                  value={filters.query}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      query: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-1 xl:col-span-2">
              <Label htmlFor="log-action">작업</Label>
              <Select
                value={filters.action}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, action: value }))
                }
              >
                <SelectTrigger id="log-action">
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 xl:col-span-2">
              <Label htmlFor="log-member">멤버</Label>
              <Input
                id="log-member"
                placeholder="멤버명"
                value={filters.member}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, member: event.target.value }))
                }
              />
            </div>

            <div className="space-y-1 xl:col-span-2">
              <Label htmlFor="log-date-from">시작일</Label>
              <Input
                id="log-date-from"
                type="date"
                value={filters.dateFrom}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, dateFrom: event.target.value }))
                }
              />
            </div>

            <div className="space-y-1 xl:col-span-2">
              <Label htmlFor="log-date-to">종료일</Label>
              <Input
                id="log-date-to"
                type="date"
                value={filters.dateTo}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, dateTo: event.target.value }))
                }
              />
            </div>

            <div className="space-y-1 md:col-span-1 xl:col-span-3">
              <Label htmlFor="log-sort">정렬</Label>
              <Select
                value={sortKey}
                onValueChange={(value) => setSortKey(value as LogSortKey)}
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

            <div className="space-y-1 xl:col-span-2">
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

            <div className="flex items-end gap-2 md:col-span-1 xl:col-span-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={handleReset}
                disabled={!hasActiveFilters}
              >
                <RotateCcw className="h-4 w-4" />
                초기화
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
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

          <div className="min-h-5 border-t pt-3">
            {dateRangeError ? (
              <p className="text-sm text-destructive">{dateRangeError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {hasActiveFilters
                  ? "선택한 조건으로 로그 목록을 좁혀 보고 있습니다."
                  : "현재 모든 로그를 표시하고 있습니다."}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">로그 목록</CardTitle>
          <CardDescription>
            로그를 클릭하면 상세 내용을 확인할 수 있습니다.
          </CardDescription>
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
                <Table className="min-w-[940px]">
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
                          className="max-w-[280px] truncate text-sm"
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

      <Dialog
        open={Boolean(selectedLog)}
        onOpenChange={(open) => !open && setSelectedLog(null)}
      >
        <DialogContent>
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
                <span>{selectedLog.previous_status || "-"}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
