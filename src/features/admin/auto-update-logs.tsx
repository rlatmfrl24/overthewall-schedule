import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Loader2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { fetchAutoUpdateLogs, type AutoUpdateLog } from "@/lib/api/settings";

const ACTION_LABELS: Record<string, string> = {
  collected: "수집됨",
  approved: "승인됨",
  rejected: "거부됨",
  created: "새 스케줄 생성",
  updated: "스케줄 업데이트",
  updated_live: "라이브 → 방송",
  updated_vod: "VOD → 방송",
};

const ACTION_BADGE_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  collected: "outline",
  approved: "default",
  rejected: "destructive",
};

const ACTION_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "collected", label: "수집됨" },
  { value: "approved", label: "승인됨" },
  { value: "rejected", label: "거부됨" },
  { value: "created", label: "새 스케줄 생성" },
  { value: "updated", label: "스케줄 업데이트" },
  { value: "updated_live", label: "라이브 → 방송" },
  { value: "updated_vod", label: "VOD → 방송" },
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

export function AutoUpdateLogsManager() {
  const [logs, setLogs] = useState<AutoUpdateLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<LogFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<LogFilters>(DEFAULT_FILTERS);
  const [selectedLog, setSelectedLog] = useState<AutoUpdateLog | null>(null);

  const loadLogs = useCallback(async (activeFilters: LogFilters) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchAutoUpdateLogs({
        limit: 200,
        action: activeFilters.action === "all" ? undefined : activeFilters.action,
        member: activeFilters.member.trim() || undefined,
        dateFrom: activeFilters.dateFrom || undefined,
        dateTo: activeFilters.dateTo || undefined,
        query: activeFilters.query.trim() || undefined,
      });
      setLogs(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load logs:", error);
      setErrorMessage("로그를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLogs(appliedFilters);
  }, [appliedFilters, loadLogs]);

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

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedFilters(filters);
  };

  const handleReset = () => {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
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

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <History className="w-5 h-5" />
            스케줄 업데이트 로그
          </h2>
          <p className="text-sm text-muted-foreground">
            자동 업데이트로 생성/승인/거부된 스케줄 기록을 확인합니다.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadLogs(appliedFilters)}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="w-4 h-4" />
            로그 필터
          </CardTitle>
          <CardDescription>기간, 액션, 멤버, 제목 키워드로 검색합니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="space-y-1">
                <Label htmlFor="log-action">액션</Label>
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
              <div className="space-y-1">
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
              <div className="space-y-1">
                <Label htmlFor="log-date-from">시작 날짜</Label>
                <Input
                  id="log-date-from"
                  type="date"
                  value={filters.dateFrom}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, dateFrom: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="log-date-to">종료 날짜</Label>
                <Input
                  id="log-date-to"
                  type="date"
                  value={filters.dateTo}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, dateTo: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="log-query">검색</Label>
                <Input
                  id="log-query"
                  placeholder="제목 또는 멤버명"
                  value={filters.query}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, query: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm">
                검색
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={!hasActiveFilters}
              >
                필터 초기화
              </Button>
            </div>
          </form>
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
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">기록이 없습니다.</div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">생성일</TableHead>
                    <TableHead>멤버</TableHead>
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
                      <TableCell className="font-medium">{log.member_name}</TableCell>
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
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedLog)} onOpenChange={(open) => !open && setSelectedLog(null)}>
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
                <span className="font-medium">{selectedLog.member_name}</span>
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
                <span className="text-right wrap-break-word max-w-[60%]">
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
