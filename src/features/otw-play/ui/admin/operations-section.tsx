import { useRef, useState } from "react";
import type {
  OtwPlayAdminObservabilityDto,
  OtwPlayAdminReleaseConfirmation,
  OtwPlayAdminReleaseFlagsDto,
  OtwPlayAdminReleaseReadResponse,
  OtwPlayAdminReleaseTransition,
  OtwPlayAdminSourceHealthDto,
} from "@contracts/otw-play";
import { ApiError } from "@/shared/api/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Checkbox } from "@/shared/ui/checkbox";
import { Label } from "@/shared/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { useToast } from "@/shared/ui/toast";
import { Activity, ArrowRight, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { updateOtwPlayAdminRelease } from "../../api/admin";

type ReleaseAction = {
  transition: OtwPlayAdminReleaseTransition;
  label: string;
  title: string;
  description: string;
  rollback: string;
  confirmation: OtwPlayAdminReleaseConfirmation;
  target: OtwPlayAdminReleaseFlagsDto;
  tone: "default" | "outline" | "destructive";
  control: "public" | "navigation";
};

const releaseActions = (
  flags: OtwPlayAdminReleaseFlagsDto,
): ReleaseAction[] => {
  if (!flags.publicReadEnabled && !flags.navigationVisible) {
    return [{
      transition: "enable_public_read",
      label: "공개 API canary 시작",
      title: "공개 API를 활성화할까요?",
      description: "익명 사용자가 직접 URL로 OTW Play를 사용할 수 있습니다. 내비게이션과 검색 색인은 아직 숨겨집니다.",
      rollback: "문제가 있으면 같은 운영 화면에서 0/0으로 즉시 rollback합니다.",
      confirmation: "direct_routes_verified",
      target: { publicReadEnabled: true, navigationVisible: false },
      tone: "default",
      control: "public",
    }];
  }
  if (flags.publicReadEnabled && !flags.navigationVisible) {
    return [
      {
        transition: "enable_navigation",
        label: "내비게이션·색인 공개",
        title: "OTW Play를 최종 공개할까요?",
        description: "내비게이션을 노출하고 /play와 published 곡을 sitemap·색인 대상으로 전환합니다.",
        rollback: "문제가 있으면 먼저 navigation만 끄거나 전체 공개를 0/0으로 되돌릴 수 있습니다.",
        confirmation: "public_canary_verified",
        target: { publicReadEnabled: true, navigationVisible: true },
        tone: "default",
        control: "navigation",
      },
      {
        transition: "rollback_all",
        label: "공개 API rollback",
        title: "OTW Play 공개를 모두 중단할까요?",
        description: "익명 public read를 중단하고 navigation을 숨깁니다. 관리자 preview와 회원 경로는 유지됩니다.",
        rollback: "재공개하려면 직접 경로 검증부터 다시 수행해야 합니다.",
        confirmation: "rollback_reviewed",
        target: { publicReadEnabled: false, navigationVisible: false },
        tone: "destructive",
        control: "public",
      },
    ];
  }
  if (flags.publicReadEnabled && flags.navigationVisible) {
    return [
      {
        transition: "disable_navigation",
        label: "내비게이션 숨기기",
        title: "내비게이션과 색인을 숨길까요?",
        description: "익명 직접 URL은 유지하지만 내비게이션을 숨기고 Play sitemap 항목을 제외합니다.",
        rollback: "canary 상태에서 문제를 확인한 뒤 다시 최종 공개할 수 있습니다.",
        confirmation: "rollback_reviewed",
        target: { publicReadEnabled: true, navigationVisible: false },
        tone: "outline",
        control: "navigation",
      },
      {
        transition: "rollback_all",
        label: "전체 공개 rollback",
        title: "OTW Play 공개를 모두 중단할까요?",
        description: "public read와 navigation을 한 command에서 모두 끕니다.",
        rollback: "재공개하려면 0/0 → 1/0 → 1/1 검증을 다시 수행해야 합니다.",
        confirmation: "rollback_reviewed",
        target: { publicReadEnabled: false, navigationVisible: false },
        tone: "destructive",
        control: "public",
      },
    ];
  }
  return [];
};

const formatCount = (value: number | null) =>
  value === null ? "수집 안 됨" : Math.round(value).toLocaleString("ko-KR");
const formatDuration = (value: number | null) =>
  value === null ? "수집 안 됨" : `${Math.round(value).toLocaleString("ko-KR")}ms`;
const formatRate = (value: number) => `${(value * 100).toFixed(1)}%`;
const formatAt = (value: number) => new Date(value).toLocaleString("ko-KR");

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function ObservabilityPanel({
  data,
  loading,
  error,
  fetching,
  refetch,
}: {
  data: OtwPlayAdminObservabilityDto | undefined;
  loading: boolean;
  error: Error | null;
  fetching: boolean;
  refetch: () => Promise<unknown>;
}) {
  if (loading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!data) {
    return (
      <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm">
        운영 지표를 불러오지 못했습니다{error ? `: ${error.message}` : "."}
        <Button className="ml-3" size="sm" variant="outline" onClick={() => void refetch()}>다시 시도</Button>
      </div>
    );
  }
  const cacheTotal = data.summary.cacheHit + data.summary.cacheMiss + data.summary.cacheBypass;
  const cacheHitRate = cacheTotal > 0 ? data.summary.cacheHit / cacheTotal : 0;
  return (
    <section aria-labelledby="observability-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="observability-title" className="flex items-center gap-2 text-lg font-semibold"><Activity className="h-5 w-5" /> 최근 24시간 관측</h2>
          <p className="text-sm text-muted-foreground">Workers Analytics Engine 집계이며 개별 요청이나 검색 원문은 표시하지 않습니다.</p>
        </div>
        <Button size="sm" variant="outline" disabled={fetching} onClick={() => void refetch()}>
          {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} 새로고침
        </Button>
      </div>
      {data.status !== "available" && (
        <div role="status" className="rounded-xl border border-amber-300/50 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          {data.status === "unconfigured"
            ? "Analytics 조회 token이 설정되지 않았습니다. 공개 제어는 계속 사용할 수 있습니다."
            : "Analytics 집계를 일시적으로 불러올 수 없습니다. 공개 제어와 권위 상태에는 영향이 없습니다."}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" aria-live="polite">
        <MetricCard label="요청" value={formatCount(data.summary.requestCount)} />
        <MetricCard label="오류율" value={formatRate(data.summary.errorRate)} />
        <MetricCard label="cache hit" value={formatRate(cacheHitRate)} />
        <MetricCard label="p95" value={formatDuration(data.summary.p95DurationMs)} />
        <MetricCard label="D1 rows read" value={formatCount(data.summary.d1RowsRead)} />
        <MetricCard label="D1 rows written" value={formatCount(data.summary.d1RowsWritten)} />
      </div>
      {data.status === "available" && data.routes.length === 0 ? (
        <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">최근 24시간 route 집계가 없습니다.</p>
      ) : data.routes.length > 0 ? (
        <>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader><TableRow><TableHead>route</TableHead><TableHead>요청</TableHead><TableHead>오류율</TableHead><TableHead>cache hit/miss/bypass</TableHead><TableHead>p95</TableHead><TableHead>D1 read/write</TableHead></TableRow></TableHeader>
              <TableBody>{data.routes.map((route) => (
                <TableRow key={route.routeId}>
                  <TableCell className="font-mono text-xs">{route.routeId}</TableCell>
                  <TableCell>{formatCount(route.requestCount)}</TableCell>
                  <TableCell>{formatRate(route.errorRate)}</TableCell>
                  <TableCell>{route.cacheHit}/{route.cacheMiss}/{route.cacheBypass}</TableCell>
                  <TableCell>{formatDuration(route.p95DurationMs)}</TableCell>
                  <TableCell>{formatCount(route.d1RowsRead)}/{formatCount(route.d1RowsWritten)}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
          <div className="space-y-3 md:hidden">{data.routes.map((route) => (
            <Card key={route.routeId}><CardContent className="space-y-3 p-4">
              <p className="break-all font-mono text-xs font-semibold">{route.routeId}</p>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-muted-foreground">요청</dt><dd>{formatCount(route.requestCount)}</dd></div>
                <div><dt className="text-muted-foreground">오류율</dt><dd>{formatRate(route.errorRate)}</dd></div>
                <div><dt className="text-muted-foreground">p95</dt><dd>{formatDuration(route.p95DurationMs)}</dd></div>
                <div><dt className="text-muted-foreground">D1 read/write</dt><dd>{formatCount(route.d1RowsRead)}/{formatCount(route.d1RowsWritten)}</dd></div>
              </dl>
            </CardContent></Card>
          ))}</div>
        </>
      ) : null}
      <Card>
        <CardHeader><CardTitle className="text-base">도메인 이벤트</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {data.events.length > 0 ? data.events.map((event) => (
            <Badge key={event.event} variant="outline">{event.event} · {formatCount(event.count)}</Badge>
          )) : <p className="text-sm text-muted-foreground">집계된 도메인 이벤트가 없습니다.</p>}
        </CardContent>
      </Card>
    </section>
  );
}

function ReleasePanel({
  release,
  loading,
  error,
  onChanged,
}: {
  release: OtwPlayAdminReleaseReadResponse | undefined;
  loading: boolean;
  error: Error | null;
  onChanged: () => Promise<unknown>;
}) {
  const { toast } = useToast();
  const [pending, setPending] = useState<ReleaseAction | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const close = () => {
    setPending(null);
    setConfirmed(false);
    setTimeout(() => triggerRef.current?.focus(), 0);
  };
  if (loading) {
    return <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!release) {
    return <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm">공개 권위 상태를 불러오지 못했습니다{error ? `: ${error.message}` : "."}</div>;
  }
  const state = release.data;
  const actions = releaseActions(state);
  const run = async () => {
    if (!pending || !confirmed || saving) return;
    setSaving(true);
    try {
      await updateOtwPlayAdminRelease({
        expected: {
          publicReadEnabled: state.publicReadEnabled,
          navigationVisible: state.navigationVisible,
          updatedAt: state.updatedAt,
        },
        target: pending.target,
        confirmation: pending.confirmation,
      });
      await onChanged();
      toast({ variant: "success", description: "공개 권위 상태를 변경하고 감사 이력을 기록했습니다." });
      close();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "PLAY_ADMIN_STALE_WRITE") {
        await onChanged();
        toast({ variant: "info", description: "다른 변경이 먼저 반영되었습니다. 최신 권위 상태를 다시 불러왔습니다." });
        close();
      } else {
        toast({ variant: "error", description: "공개 권위 상태를 변경하지 못했습니다." });
      }
    } finally {
      setSaving(false);
    }
  };
  const openAction = (action: ReleaseAction, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setConfirmed(false);
    setPending(action);
  };
  const actionFor = (control: ReleaseAction["control"]) =>
    actions.filter((action) => action.control === control);
  return (
    <section aria-labelledby="release-title" className="space-y-4">
      <div>
        <h2 id="release-title" className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="h-5 w-5" /> 운영·공개 권위</h2>
        <p className="text-sm text-muted-foreground">배포와 분리된 감사 command만 flag를 변경합니다. optimistic 상태는 표시하지 않습니다.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">catalog r{state.catalogRevision}</Badge>
        <Badge variant={state.readyForPublicRead ? "secondary" : "destructive"}>read model {state.readModelRevision === null ? "없음" : `r${state.readModelRevision}`}</Badge>
        <Badge variant="outline">갱신 {formatAt(state.updatedAt)}</Badge>
      </div>
      {!state.readyForPublicRead && (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">catalog와 read-model revision이 다릅니다. 공개 활성화는 서버에서도 차단됩니다.</div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {([
          ["public", "공개 API", state.publicReadEnabled, "익명 직접 URL과 public catalog read"],
          ["navigation", "내비게이션·색인", state.navigationVisible, "메뉴 노출, index와 sitemap 포함"],
        ] as const).map(([control, title, enabled, description]) => (
          <Card key={control}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3"><CardTitle className="text-base">{title}</CardTitle><Badge variant={enabled ? "secondary" : "outline"}>{enabled ? "활성" : "비활성"}</Badge></div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{description}</p>
              <div className="flex flex-wrap gap-2">{actionFor(control).map((action) => (
                <Button key={action.transition} size="sm" variant={action.tone} disabled={saving || (!state.readyForPublicRead && (action.transition === "enable_public_read" || action.transition === "enable_navigation"))} onClick={(event) => openAction(action, event.currentTarget)}>
                  {action.label} <ArrowRight className="h-4 w-4" />
                </Button>
              ))}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">최근 공개 변경</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {release.recentChanges.length === 0 ? <p className="text-sm text-muted-foreground">기록된 공개 변경이 없습니다.</p> : release.recentChanges.map((change) => (
            <div key={change.id} className="flex flex-col gap-1 border-b pb-3 text-sm last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div><span className="font-medium">{change.transition}</span><span className="ml-2 text-muted-foreground">{Number(change.previous.publicReadEnabled)}/{Number(change.previous.navigationVisible)} → {Number(change.current.publicReadEnabled)}/{Number(change.current.navigationVisible)}</span></div>
              <div className="text-xs text-muted-foreground">{change.actor.displayName ?? change.actor.id} · {formatAt(change.changedAt)}</div>
            </div>
          ))}
        </CardContent>
      </Card>
      <AlertDialog open={pending !== null} onOpenChange={(open) => { if (!open && !saving) close(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
            <AlertDialogDescription asChild><div className="space-y-2"><p>{pending?.description}</p><p className="font-medium text-foreground">{pending?.rollback}</p></div></AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-start gap-2 rounded-lg border p-3">
            <Checkbox id="release-confirmation" checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} disabled={saving} />
            <Label htmlFor="release-confirmation" className="text-sm leading-relaxed">영향과 rollback 경계를 확인했으며 `{pending?.confirmation}` 조건을 충족했습니다.</Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>취소</AlertDialogCancel>
            <AlertDialogAction disabled={!confirmed || saving} onClick={(event) => { event.preventDefault(); void run(); }}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} 권위 상태 변경
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export function OperationsSection({
  observability,
  observabilityLoading,
  observabilityError,
  observabilityFetching,
  refetchObservability,
  release,
  releaseLoading,
  releaseError,
  sourceHealth,
  onReleaseChanged,
  onOpenSourceHealth,
}: {
  observability: OtwPlayAdminObservabilityDto | undefined;
  observabilityLoading: boolean;
  observabilityError: Error | null;
  observabilityFetching: boolean;
  refetchObservability: () => Promise<unknown>;
  release: OtwPlayAdminReleaseReadResponse | undefined;
  releaseLoading: boolean;
  releaseError: Error | null;
  sourceHealth: OtwPlayAdminSourceHealthDto | undefined;
  onReleaseChanged: () => Promise<unknown>;
  onOpenSourceHealth: () => void;
}) {
  return (
    <div className="space-y-8">
      <ReleasePanel release={release} loading={releaseLoading} error={releaseError} onChanged={onReleaseChanged} />
      <ObservabilityPanel data={observability} loading={observabilityLoading} error={observabilityError} fetching={observabilityFetching} refetch={refetchObservability} />
      <Card>
        <CardHeader><CardTitle className="text-base">소스 상태 연결</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline">재확인 필요 {sourceHealth?.counts.due ?? "-"}</Badge>
            <Badge variant="outline">재생 불가 {sourceHealth?.counts.unplayable ?? "-"}</Badge>
            <Badge variant="outline">최근 복구 {sourceHealth?.counts.recentlyRecovered ?? "-"}</Badge>
          </div>
          <Button size="sm" variant="outline" onClick={onOpenSourceHealth}>소스 상태 열기 <ArrowRight className="h-4 w-4" /></Button>
        </CardContent>
      </Card>
    </div>
  );
}
