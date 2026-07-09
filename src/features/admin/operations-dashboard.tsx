import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Coffee,
  DatabaseZap,
  Loader2,
  Play,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import {
  fetchOperationsStatus,
  runNaverCafeCheckNow,
  type AutoUpdateOperationRun,
  type NaverCafeOperationSource,
  type OperationsIssue,
  type OperationsStatusLevel,
  type XCollectionOperationRun,
} from "@/lib/api/operations";
import {
  runAutoUpdateNow,
  runXCollectionNow,
} from "@/lib/api/settings";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { AdminSectionHeader } from "./components/admin-section-header";

const WINDOW_HOURS = 24;

const formatDateTime = (value: number | null | undefined) => {
  if (!value) return "아직 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "확인 불가";
  return date.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDuration = (
  startedAt: number,
  finishedAt: number | null | undefined,
) => {
  if (!finishedAt) return "-";
  const seconds = Math.max(0, Math.round((finishedAt - startedAt) / 1000));
  if (seconds < 60) return `${seconds}초`;
  return `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
};

const formatCost = (micros: number) => `$${(micros / 1_000_000).toFixed(4)}`;

const getSummaryLabel = (status: OperationsStatusLevel) => {
  if (status === "ok") return "정상";
  if (status === "warning") return "주의";
  return "위험";
};

const getStatusBadgeClass = (status: string) =>
  cn(
    status === "ok" || status === "success"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
      : status === "warning" || status === "stale" || status === "skipped"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-700"
        : "border-destructive/40 bg-destructive/10 text-destructive",
  );

const getRunStatusLabel = (status: string) => {
  if (status === "success") return "성공";
  if (status === "skipped") return "건너뜀";
  if (status === "ok") return "정상";
  if (status === "stale") return "스테일";
  return "실패";
};

function MetricCard({
  title,
  value,
  description,
  status,
}: {
  title: string;
  value: string;
  description: string;
  status?: OperationsStatusLevel;
}) {
  return (
    <Card>
      <CardHeader className="space-y-1 pb-2">
        <CardDescription>{title}</CardDescription>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-2xl">{value}</CardTitle>
          {status ? (
            <Badge className={getStatusBadgeClass(status)} variant="outline">
              {getSummaryLabel(status)}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function IssueList({ issues }: { issues: OperationsIssue[] }) {
  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700">
        <CheckCircle2 className="h-4 w-4" />
        현재 표시할 운영 이슈가 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {issues.map((issue, index) => (
        <div
          key={`${issue.code}-${index}`}
          className={cn(
            "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
            issue.severity === "critical"
              ? "border-destructive/30 bg-destructive/5 text-destructive"
              : "border-amber-500/30 bg-amber-500/5 text-amber-700",
          )}
        >
          {issue.severity === "critical" ? (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{issue.message}</span>
        </div>
      ))}
    </div>
  );
}

function AutoUpdateRunsTable({ runs }: { runs: AutoUpdateOperationRun[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>시각</TableHead>
          <TableHead>구분</TableHead>
          <TableHead>상태</TableHead>
          <TableHead>확인</TableHead>
          <TableHead>대기 생성</TableHead>
          <TableHead>소요</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="text-muted-foreground">
              실행 이력이 없습니다.
            </TableCell>
          </TableRow>
        ) : (
          runs.map((run) => (
            <TableRow key={run.id}>
              <TableCell>{formatDateTime(run.startedAt)}</TableCell>
              <TableCell>
                {run.source === "manual" ? "수동" : "스케줄"}
              </TableCell>
              <TableCell>
                <Badge
                  className={getStatusBadgeClass(run.status)}
                  variant="outline"
                >
                  {getRunStatusLabel(run.status)}
                </Badge>
              </TableCell>
              <TableCell>{run.checkedCount}</TableCell>
              <TableCell>{run.pendingCreatedCount}</TableCell>
              <TableCell>{formatDuration(run.startedAt, run.finishedAt)}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function XRunsTable({ runs }: { runs: XCollectionOperationRun[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>시각</TableHead>
          <TableHead>구분</TableHead>
          <TableHead>상태</TableHead>
          <TableHead>핸들</TableHead>
          <TableHead>저장</TableHead>
          <TableHead>API</TableHead>
          <TableHead>비용</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-muted-foreground">
              수집 이력이 없습니다.
            </TableCell>
          </TableRow>
        ) : (
          runs.map((run) => (
            <TableRow key={run.id}>
              <TableCell>{formatDateTime(run.startedAt)}</TableCell>
              <TableCell>{run.source === "manual" ? "수동" : "스케줄"}</TableCell>
              <TableCell>
                <Badge
                  className={getStatusBadgeClass(run.status)}
                  variant="outline"
                >
                  {getRunStatusLabel(run.status)}
                </Badge>
              </TableCell>
              <TableCell>
                {run.refreshedHandles}/{run.checkedHandles}
              </TableCell>
              <TableCell>{run.postsStored}</TableCell>
              <TableCell>{run.apiCalls}</TableCell>
              <TableCell>{formatCost(run.estimatedCostMicros)}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function NaverCafeSourceTable({
  sources,
}: {
  sources: NaverCafeOperationSource[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>소스</TableHead>
          <TableHead>상태</TableHead>
          <TableHead>최근 점검</TableHead>
          <TableHead>게시글</TableHead>
          <TableHead>오류</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sources.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="text-muted-foreground">
              등록된 네이버 카페 소스가 없습니다.
            </TableCell>
          </TableRow>
        ) : (
          sources.map((source) => {
            const status = source.latestCheck?.status ?? "stale";
            return (
              <TableRow key={source.sourceId}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{source.sourceName}</span>
                    <span className="text-xs text-muted-foreground">
                      {source.cafeId}/{source.menuId}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    className={getStatusBadgeClass(status)}
                    variant="outline"
                  >
                    {source.enabled ? getRunStatusLabel(status) : "비활성"}
                  </Badge>
                </TableCell>
                <TableCell>{formatDateTime(source.latestCheck?.checkedAt)}</TableCell>
                <TableCell>{source.latestCheck?.postCount ?? "-"}</TableCell>
                <TableCell className="max-w-72 truncate">
                  {source.latestCheck?.error ?? "-"}
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}

export function OperationsDashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const statusQuery = useQuery({
    queryKey: queryKeys.operations.status(WINDOW_HOURS),
    queryFn: () => fetchOperationsStatus(WINDOW_HOURS),
    staleTime: 30_000,
  });

  const invalidateOperations = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.operations.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.all }),
    ]);
  };

  const autoUpdateMutation = useMutation({
    mutationFn: runAutoUpdateNow,
    onSuccess: async () => {
      await invalidateOperations();
      toast({
        variant: "success",
        description: "자동 업데이트를 실행했습니다.",
      });
    },
    onError: () => {
      toast({
        variant: "error",
        description: "자동 업데이트 실행에 실패했습니다.",
      });
    },
  });

  const xCollectionMutation = useMutation({
    mutationFn: runXCollectionNow,
    onSuccess: async () => {
      await invalidateOperations();
      toast({
        variant: "success",
        description: "X 게시글 수집을 실행했습니다.",
      });
    },
    onError: () => {
      toast({
        variant: "error",
        description: "X 게시글 수집 실행에 실패했습니다.",
      });
    },
  });

  const naverCafeCheckMutation = useMutation({
    mutationFn: runNaverCafeCheckNow,
    onSuccess: async (result) => {
      await invalidateOperations();
      toast({
        variant: result.success ? "success" : "error",
        description: result.success
          ? "네이버 카페 상태 점검을 완료했습니다."
          : "네이버 카페 상태 점검에서 실패한 소스가 있습니다.",
      });
    },
    onError: () => {
      toast({
        variant: "error",
        description: "네이버 카페 상태 점검에 실패했습니다.",
      });
    },
  });

  const isActionRunning =
    autoUpdateMutation.isPending ||
    xCollectionMutation.isPending ||
    naverCafeCheckMutation.isPending;

  if (statusQuery.isLoading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (statusQuery.isError || !statusQuery.data) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <AdminSectionHeader
          title="운영 대시보드"
          description="운영 상태를 불러오지 못했습니다."
          actions={
            <Button
              variant="outline"
              onClick={() => void statusQuery.refetch()}
            >
              <RefreshCw className="h-4 w-4" />
              다시 시도
            </Button>
          }
        />
      </div>
    );
  }

  const data = statusQuery.data;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <AdminSectionHeader
        title="운영 대시보드"
        description={`최근 ${data.window.hours}시간 기준 상태입니다.`}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => void statusQuery.refetch()}
              disabled={statusQuery.isFetching || isActionRunning}
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  statusQuery.isFetching && "animate-spin",
                )}
              />
              새로고침
            </Button>
            <Button
              variant="outline"
              onClick={() => autoUpdateMutation.mutate()}
              disabled={isActionRunning}
            >
              <Play className="h-4 w-4" />
              자동 업데이트
            </Button>
            <Button
              variant="outline"
              onClick={() => xCollectionMutation.mutate()}
              disabled={isActionRunning}
            >
              <DatabaseZap className="h-4 w-4" />X 수집
            </Button>
            <Button
              variant="outline"
              onClick={() => naverCafeCheckMutation.mutate()}
              disabled={isActionRunning}
            >
              <Coffee className="h-4 w-4" />
              카페 점검
            </Button>
          </>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="전체 상태"
          value={getSummaryLabel(data.summary.status)}
          description={`이슈 ${data.summary.issues.length}건`}
          status={data.summary.status}
        />
        <MetricCard
          title="자동 업데이트"
          value={data.autoUpdate.enabled ? "활성" : "비활성"}
          description={`최근 실행 ${formatDateTime(data.autoUpdate.lastRun)}`}
        />
        <MetricCard
          title="X 수집"
          value={`${data.xCollection.usage.apiCalls} calls`}
          description={`${formatCost(data.xCollection.usage.estimatedCostMicros)} / 최근 ${data.window.hours}시간`}
        />
        <MetricCard
          title="네이버 카페"
          value={`${data.naverCafe.enabledSourceCount}/${data.naverCafe.sourceCount}`}
          description={`실패 ${data.naverCafe.failingSourceCount}개, 오래됨 ${data.naverCafe.staleSourceCount}개`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock3 className="h-4 w-4" />
                자동 업데이트
              </CardTitle>
              <CardDescription>
                다음 실행 가능 시각 {formatDateTime(data.autoUpdate.nextEligibleAt)}
                {" · "}
                승인 대기 {data.autoUpdate.pending.total}건
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AutoUpdateRunsTable runs={data.autoUpdate.recentRuns} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <DatabaseZap className="h-4 w-4" />
                X 게시글 수집
              </CardTitle>
              <CardDescription>
                다음 실행 가능 시각 {formatDateTime(data.xCollection.nextEligibleAt)}
                {" · "}
                일 예산 {data.xCollection.dailyBudgetCents}¢
              </CardDescription>
            </CardHeader>
            <CardContent>
              <XRunsTable runs={data.xCollection.recentRuns} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Coffee className="h-4 w-4" />
                네이버 카페 소스
              </CardTitle>
              <CardDescription>
                공개 범위 {data.naverCafe.visibility}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NaverCafeSourceTable sources={data.naverCafe.sources} />
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4" />
              주의 필요
            </CardTitle>
            <CardDescription>
              마지막 업데이트 {new Date(data.updatedAt).toLocaleString("ko-KR")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <IssueList issues={data.summary.issues} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
