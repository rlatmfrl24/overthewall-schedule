import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  EyeOff,
  Globe2,
  Coffee,
  Gauge,
  Loader2,
  LockKeyhole,
  MessageSquareText,
  RefreshCw,
  Settings2,
} from "lucide-react";
import IconX from "@/assets/icon_x.svg";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { ButtonGroup } from "@/shared/ui/button-group";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Label } from "@/shared/ui/label";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Switch } from "@/shared/ui/switch";
import { useToast } from "@/shared/ui/toast";
import {
  isXCollectionIntervalHours,
  normalizeXCollectionIntervalHours,
  X_COLLECTION_INTERVAL_HOURS,
  fetchSettings,
  updateSettings,
  type AutoUpdateSettings,
} from "@/features/configuration";
import {
  fetchOperationsStatus,
  runNaverCafeCheckNow,
  runXCollectionNow,
  useOperationRun,
  type OperationRunAccepted,
  type OperationsStatusResponse,
  type XCollectionRunResult,
} from "@/features/operations";
import type { NaverCafePostsVisibility } from "@contracts/naver-cafe";
import type { XPostsVisibility } from "@contracts/x-posts";
import { AdminSectionHeader } from "@/app/admin";
import {
  MemberPostFeedMonitor,
  type MemberPostSource,
} from "./member-post-feed-monitor";
import { NaverCafeSourceManager } from "@/features/naver-cafe";
import { queryKeys } from "@/shared/query/query-keys";
import { cn } from "@/shared/lib/utils";

const VISIBILITY_OPTIONS: Array<{
  value: XPostsVisibility;
  label: string;
  description: string;
  icon: typeof Globe2;
}> = [
  {
    value: "public",
    label: "모두 공개",
    description: "로그인하지 않은 방문자도 메뉴와 피드를 볼 수 있습니다.",
    icon: Globe2,
  },
  {
    value: "members",
    label: "회원 전용",
    description: "로그인한 회원에게만 메뉴와 피드를 표시합니다.",
    icon: LockKeyhole,
  },
  {
    value: "private",
    label: "비공개",
    description: "사용자 메뉴와 피드에서 숨기고 관리자 모니터링은 유지합니다.",
    icon: EyeOff,
  },
];

const X_COLLECTION_INTERVAL_OPTIONS = X_COLLECTION_INTERVAL_HOURS.map(
  (value) => ({
    value,
    label: `${value}시간마다`,
  }),
);

const formatCollectionLastRun = (value: string | null | undefined) => {
  if (!value) return "아직 없음";
  const parsed = Number.parseInt(value, 10);
  const date = Number.isFinite(parsed) ? new Date(parsed) : new Date(value);
  if (Number.isNaN(date.getTime())) return "확인 불가";
  return date.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getCollectionStatusLabel = (status: XCollectionRunResult["status"]) => {
  if (status === "success") return "완료";
  if (status === "skipped") return "건너뜀";
  return "실패";
};

const SOURCE_TABS: Array<{
  value: MemberPostSource;
  label: string;
  description: string;
}> = [
  {
    value: "x",
    label: "X 수집",
    description: "API 비용·주기·계정 상태",
  },
  {
    value: "naver-cafe",
    label: "네이버 카페 수집",
    description: "게시판 소스·점검 상태",
  },
];

const formatOperationDate = (value: number | null | undefined) => {
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

const getVisibilityLabel = (
  visibility: XPostsVisibility | NaverCafePostsVisibility,
) => {
  if (visibility === "public") return "모두 공개";
  if (visibility === "private") return "비공개";
  return "회원 전용";
};

type SourceHealth = "ok" | "warning" | "critical" | "paused" | "loading";

const SOURCE_HEALTH_META: Record<
  SourceHealth,
  { label: string; description: string }
> = {
  ok: {
    label: "정상 운영",
    description: "최근 실행과 수집 응답에서 주의할 항목이 없습니다.",
  },
  warning: {
    label: "주의 필요",
    description: "지연, API 실패 또는 예산 사용량을 확인하세요.",
  },
  critical: {
    label: "조치 필요",
    description: "최근 수집 실패 또는 운영 한도 초과가 감지되었습니다.",
  },
  paused: {
    label: "운영 중지",
    description: "현재 설정에서 자동 수집 또는 사용자 표시가 꺼져 있습니다.",
  },
  loading: {
    label: "상태 확인 중",
    description: "최신 운영 지표를 불러오고 있습니다.",
  },
};

function getSourceHealth({
  source,
  enabled,
  data,
  loading,
  error,
}: {
  source: MemberPostSource;
  enabled: boolean;
  data: OperationsStatusResponse | null;
  loading: boolean;
  error: boolean;
}): SourceHealth {
  if (loading && !data) return "loading";
  if (!enabled) return "paused";
  if (error || !data) return "warning";

  if (source === "x") {
    if (
      data.xCollection.latestRun?.status === "failed" ||
      data.xCollection.usage.quota.todayBudgetUsedPercent >= 100
    ) {
      return "critical";
    }
    if (
      data.xCollection.usage.failureCount > 0 ||
      data.xCollection.usage.rateLimitCount > 0 ||
      data.xCollection.usage.quota.todayBudgetUsedPercent >= 80
    ) {
      return "warning";
    }
    return "ok";
  }

  if (data.naverCafe.failingSourceCount > 0) return "critical";
  if (data.naverCafe.staleSourceCount > 0) return "warning";
  return "ok";
}

function HealthBadge({ health }: { health: SourceHealth }) {
  const meta = SOURCE_HEALTH_META[health];
  const Icon =
    health === "ok"
      ? CheckCircle2
      : health === "loading"
        ? Loader2
        : health === "paused"
          ? Clock3
          : AlertTriangle;
  return (
    <Badge
      variant={health === "critical" ? "destructive" : "outline"}
      className={cn(
        "gap-1.5",
        health === "ok" &&
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
        health === "warning" &&
          "border-amber-500/40 bg-amber-500/10 text-amber-700",
        health === "paused" && "bg-muted text-muted-foreground",
      )}
    >
      <Icon
        className={cn(
          "h-3.5 w-3.5",
          health === "loading" && "animate-spin",
        )}
      />
      {meta.label}
    </Badge>
  );
}

function SummaryValue({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border bg-background/70 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

export function SourceOperationalSummary({
  source,
  xCollectionEnabled,
  xPostsVisibility,
  naverCafeVisibility,
  data,
  loading,
  error,
}: {
  source: MemberPostSource;
  xCollectionEnabled: boolean;
  xPostsVisibility: XPostsVisibility;
  naverCafeVisibility: NaverCafePostsVisibility;
  data: OperationsStatusResponse | null;
  loading: boolean;
  error: boolean;
}) {
  const isX = source === "x";
  const enabled = isX
    ? xCollectionEnabled
    : data
      ? data.naverCafe.enabledSourceCount > 0
      : true;
  const health = getSourceHealth({ source, enabled, data, loading, error });
  const healthMeta = SOURCE_HEALTH_META[health];

  if (isX) {
    const x = data?.xCollection;
    const budgetPercent = Math.max(
      0,
      Math.min(100, x?.usage.quota.todayBudgetUsedPercent ?? 0),
    );
    return (
      <Card className="overflow-hidden border-primary/20">
        <CardHeader className="border-b bg-gradient-to-r from-muted/60 to-background pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border bg-background">
                  <img src={IconX} alt="" className="h-4 w-4" />
                </span>
                X 현재 운영 상태
              </CardTitle>
              <CardDescription>{healthMeta.description}</CardDescription>
            </div>
            <HealthBadge health={health} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryValue
              label="자동 수집"
              value={enabled ? "활성" : "중지"}
              detail={`${x?.intervalHours ?? normalizeXCollectionIntervalHours(undefined)}시간 주기`}
            />
            <SummaryValue
              label="공개 범위"
              value={getVisibilityLabel(xPostsVisibility)}
              detail="X 피드 사용자 접근 정책"
            />
            <SummaryValue
              label="최근 수집"
              value={formatOperationDate(x?.lastRun)}
              detail={
                x?.latestRun
                  ? `${x.latestRun.source === "manual" ? "수동" : "예약"} · ${getCollectionStatusLabel(x.latestRun.status)}`
                  : "실행 이력 없음"
              }
            />
            <SummaryValue
              label="오늘 예산"
              value={`${budgetPercent}%`}
              detail={`${x?.usage.apiCalls ?? 0} calls · rate-limit ${x?.usage.rateLimitCount ?? 0}회`}
            />
          </div>
          <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="flex items-center gap-1.5 font-medium">
                <Gauge className="h-3.5 w-3.5" />
                일일 X API 예산 사용률
              </span>
              <span className="tabular-nums text-muted-foreground">
                {budgetPercent}%
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="X API 일일 예산 사용률"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={budgetPercent}
              className="h-2 overflow-hidden rounded-full bg-muted"
            >
              <div
                className={cn(
                  "h-full rounded-full transition-[width]",
                  budgetPercent >= 100
                    ? "bg-destructive"
                    : budgetPercent >= 80
                      ? "bg-amber-500"
                      : "bg-emerald-500",
                )}
                style={{ width: `${budgetPercent}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const cafe = data?.naverCafe;
  const enabledSources = cafe?.enabledSourceCount ?? 0;
  const healthySources = Math.max(
    0,
    enabledSources -
      (cafe?.failingSourceCount ?? 0) -
      (cafe?.staleSourceCount ?? 0),
  );
  const healthyPercent = enabledSources
    ? Math.round((healthySources / enabledSources) * 100)
    : 0;

  return (
    <Card className="overflow-hidden border-emerald-500/20">
      <CardHeader className="border-b bg-gradient-to-r from-emerald-500/5 to-background pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border bg-background">
                <Coffee className="h-4 w-4 text-emerald-600" />
              </span>
              네이버 카페 현재 운영 상태
            </CardTitle>
            <CardDescription>{healthMeta.description}</CardDescription>
          </div>
          <HealthBadge health={health} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryValue
            label="피드 표시"
            value={enabled ? "활성" : "중지"}
            detail={`${cafe?.collection.intervalHours ?? "-"}시간 고정 수집 주기`}
          />
          <SummaryValue
            label="공개 범위"
            value={getVisibilityLabel(naverCafeVisibility)}
            detail="카페 피드 사용자 접근 정책"
          />
          <SummaryValue
            label="최근 수집"
            value={formatOperationDate(cafe?.collection.lastRun)}
            detail={`다음 가능 ${formatOperationDate(cafe?.collection.nextEligibleAt)}`}
          />
          <SummaryValue
            label="소스 상태"
            value={`${enabledSources}/${cafe?.sourceCount ?? 0} 활성`}
            detail={`오류 ${cafe?.failingSourceCount ?? 0} · 확인 지연 ${cafe?.staleSourceCount ?? 0}`}
          />
        </div>
        <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-1.5 font-medium">
              <Gauge className="h-3.5 w-3.5" />
              활성 게시판 정상 비율
            </span>
            <span className="tabular-nums text-muted-foreground">
              {healthySources}/{enabledSources}개 · {healthyPercent}%
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="활성 네이버 카페 게시판 정상 비율"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={healthyPercent}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width]"
              style={{ width: `${healthyPercent}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function SectionIntro({
  kind,
  title,
  description,
}: {
  kind: "관리·설정" | "모니터링";
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 pt-2">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-muted/30">
        {kind === "관리·설정" ? (
          <Settings2 className="h-4 w-4" />
        ) : (
          <Gauge className="h-4 w-4" />
        )}
      </span>
      <div>
        <Badge variant="outline" className="mb-1">
          {kind}
        </Badge>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function MemberPostSettingsManager({
  activeSource: controlledActiveSource,
  onActiveSourceChange,
}: {
  activeSource?: MemberPostSource;
  onActiveSourceChange?: (source: MemberPostSource) => void;
} = {}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [uncontrolledActiveSource, setUncontrolledActiveSource] = useState<MemberPostSource>("x");
  const activeSource = controlledActiveSource ?? uncontrolledActiveSource;
  const setActiveSource = (source: MemberPostSource) => {
    setUncontrolledActiveSource(source);
    onActiveSourceChange?.(source);
  };
  const [isSaving, setIsSaving] = useState(false);
  const [isRunningCollection, setIsRunningCollection] = useState(false);
  const [isRunningNaverCafeCheck, setIsRunningNaverCafeCheck] =
    useState(false);
  const [budgetDraft, setBudgetDraft] = useState("100");
  const [collectionRun, setCollectionRun] =
    useState<OperationRunAccepted | null>(null);
  const collectionRunQuery = useOperationRun(collectionRun);
  const settingsQuery = useQuery({
    queryKey: queryKeys.settings.detail(),
    queryFn: fetchSettings,
    staleTime: 0,
  });
  const operationsQuery = useQuery({
    queryKey: queryKeys.operations.status(24),
    queryFn: () => fetchOperationsStatus(24),
    staleTime: 30_000,
  });
  const settings = settingsQuery.data ?? null;
  const isFetching = settingsQuery.isFetching;

  const patchSettings = useCallback(
    (patch: Partial<AutoUpdateSettings>) => {
      queryClient.setQueryData<AutoUpdateSettings>(
        queryKeys.settings.detail(),
        (current: AutoUpdateSettings | undefined) =>
          current ? { ...current, ...patch } : current,
      );
    },
    [queryClient],
  );

  const loadSettings = useCallback(async () => {
    try {
      await Promise.all([settingsQuery.refetch(), operationsQuery.refetch()]);
      setCollectionRun(null);
    } catch (error) {
      console.error("Failed to load member post settings:", error);
      toast({
        variant: "error",
        description: "멤버 게시글 관리 설정을 불러오지 못했습니다.",
      });
    }
  }, [operationsQuery, settingsQuery, toast]);

  useEffect(() => {
    setBudgetDraft(settings?.x_collection_daily_budget_cents ?? "100");
  }, [settings?.x_collection_daily_budget_cents]);

  useEffect(() => {
    const run = collectionRunQuery.data;
    if (!run || !["succeeded", "partial", "failed", "skipped", "throttled"].includes(run.status)) {
      return;
    }
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.operations.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.memberPosts.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.all }),
    ]);
  }, [collectionRunQuery.data, queryClient]);

  const isRichXLinkPreviewEnabled =
    settings?.x_rich_link_preview_enabled !== "false";
  const xPostsVisibility = settings?.x_posts_visibility ?? "members";
  const isNaverCafePostsEnabled =
    settings?.naver_cafe_posts_enabled !== "false";
  const naverCafePostsVisibility =
    settings?.naver_cafe_posts_visibility ?? "members";
  const isXCollectionEnabled = settings?.x_collection_enabled !== "false";
  const xCollectionInterval = normalizeXCollectionIntervalHours(
    settings?.x_collection_interval_hours,
  );

  const handleVisibilityChange = async (visibility: XPostsVisibility) => {
    if (!settings || visibility === xPostsVisibility) return;
    setIsSaving(true);
    try {
      await updateSettings({ x_posts_visibility: visibility });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.settings.detail(),
      });
      patchSettings({ x_posts_visibility: visibility });
      queryClient.setQueryData(queryKeys.memberPosts.xConfig(), {
        visibility,
      });
      toast({
        variant: "success",
        description: "멤버 게시글 공개 범위를 변경했습니다.",
      });
    } catch (error) {
      console.error("Failed to update member post visibility:", error);
      toast({
        variant: "error",
        description: "멤버 게시글 공개 범위 변경에 실패했습니다.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleXCollection = async (enabled: boolean) => {
    if (!settings) return;
    setIsSaving(true);
    try {
      await updateSettings({
        x_collection_enabled: enabled ? "true" : "false",
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.settings.detail(),
      });
      patchSettings({
        x_collection_enabled: enabled ? "true" : "false",
      });
      toast({
        variant: "success",
        description: enabled
          ? "X 게시글 백그라운드 수집을 활성화했습니다."
          : "X 게시글 백그라운드 수집을 비활성화했습니다.",
      });
    } catch (error) {
      console.error("Failed to update X collection setting:", error);
      toast({
        variant: "error",
        description: "X 게시글 수집 설정 변경에 실패했습니다.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveBudget = async () => {
    if (!settings) return;
    const normalized = String(
      Math.min(Math.max(Number.parseInt(budgetDraft, 10) || 100, 1), 100_000),
    );
    setIsSaving(true);
    try {
      await updateSettings({
        x_collection_daily_budget_cents: normalized,
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.settings.detail(),
      });
      patchSettings({
        x_collection_daily_budget_cents: normalized,
      });
      setBudgetDraft(normalized);
      toast({
        variant: "success",
        description: "X API 일일 예산을 저장했습니다.",
      });
    } catch (error) {
      console.error("Failed to update X collection budget:", error);
      toast({
        variant: "error",
        description: "X API 일일 예산 저장에 실패했습니다.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleXCollectionIntervalChange = async (interval: string) => {
    if (
      !settings ||
      !isXCollectionIntervalHours(interval) ||
      interval === xCollectionInterval
    ) {
      return;
    }
    setIsSaving(true);
    try {
      await updateSettings({
        x_collection_interval_hours: interval,
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.settings.detail(),
      });
      patchSettings({
        x_collection_interval_hours: interval,
      });
      toast({
        variant: "success",
        description: "X 게시글 수집 주기를 저장했습니다.",
      });
    } catch (error) {
      console.error("Failed to update X collection interval:", error);
      toast({
        variant: "error",
        description: "X 게시글 수집 주기 저장에 실패했습니다.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRunXCollectionNow = async () => {
    if (!settings) return;
    setIsRunningCollection(true);
    try {
      const accepted = await runXCollectionNow();
      setCollectionRun(accepted);
      toast({
        variant: "success",
        description: "X 게시글 수집이 대기열에 등록되었습니다.",
        durationMs: 5000,
      });
    } catch (error) {
      console.error("Failed to run X collection:", error);
      toast({
        variant: "error",
        description: "X 게시글 수동 수집 요청에 실패했습니다.",
      });
    } finally {
      setIsRunningCollection(false);
    }
  };

  const handleRunNaverCafeCheck = async () => {
    setIsRunningNaverCafeCheck(true);
    try {
      const accepted = await runNaverCafeCheckNow();
      setCollectionRun(accepted);
      toast({
        variant: "success",
        description: "네이버 카페 점검이 대기열에 등록되었습니다.",
        durationMs: 5000,
      });
    } catch (error) {
      console.error("Failed to run Naver Cafe check:", error);
      toast({
        variant: "error",
        description: "네이버 카페 수동 점검 요청에 실패했습니다.",
      });
    } finally {
      setIsRunningNaverCafeCheck(false);
    }
  };

  const handleToggleRichXLinkPreview = async (enabled: boolean) => {
    if (!settings) return;
    setIsSaving(true);
    try {
      await updateSettings({
        x_rich_link_preview_enabled: enabled ? "true" : "false",
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.settings.detail(),
      });
      patchSettings({
        x_rich_link_preview_enabled: enabled ? "true" : "false",
      });
      toast({
        variant: "success",
        description: enabled
          ? "X 게시글 링크 프리뷰를 활성화했습니다."
          : "X 게시글 링크 프리뷰를 비활성화했습니다.",
      });
    } catch (error) {
      console.error("Failed to update member post settings:", error);
      toast({
        variant: "error",
        description: "멤버 게시글 관리 설정 변경에 실패했습니다.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleNaverCafePosts = async (enabled: boolean) => {
    if (!settings) return;
    setIsSaving(true);
    try {
      await updateSettings({
        naver_cafe_posts_enabled: enabled ? "true" : "false",
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.settings.detail(),
      });
      patchSettings({
        naver_cafe_posts_enabled: enabled ? "true" : "false",
      });
      queryClient.setQueryData(
        queryKeys.memberPosts.naverCafeConfig(),
        (current: { enabled: boolean; visibility: NaverCafePostsVisibility } | undefined) => ({
          enabled,
          visibility: current?.visibility ?? naverCafePostsVisibility,
        }),
      );
      toast({
        variant: "success",
        description: enabled
          ? "카페 최신글을 활성화했습니다."
          : "카페 최신글을 비활성화했습니다.",
      });
    } catch (error) {
      console.error("Failed to update Naver Cafe posts setting:", error);
      toast({
        variant: "error",
        description: "카페 최신글 설정 변경에 실패했습니다.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleNaverCafeVisibilityChange = async (
    visibility: NaverCafePostsVisibility,
  ) => {
    if (!settings || visibility === naverCafePostsVisibility) return;
    setIsSaving(true);
    try {
      await updateSettings({ naver_cafe_posts_visibility: visibility });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.settings.detail(),
      });
      patchSettings({
        naver_cafe_posts_visibility: visibility,
      });
      queryClient.setQueryData(
        queryKeys.memberPosts.naverCafeConfig(),
        (current: { enabled: boolean; visibility: NaverCafePostsVisibility } | undefined) => ({
          enabled: current?.enabled ?? isNaverCafePostsEnabled,
          visibility,
        }),
      );
      toast({
        variant: "success",
        description: "카페 최신글 공개 범위를 변경했습니다.",
      });
    } catch (error) {
      console.error("Failed to update Naver Cafe visibility:", error);
      toast({
        variant: "error",
        description: "카페 최신글 공개 범위 변경에 실패했습니다.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="space-y-6">
      <AdminSectionHeader
        title="멤버 게시글 관리"
        description="수집 소스별 설정, 비용과 실제 운영 상태를 한 화면에서 관리합니다."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadSettings()}
            disabled={isFetching || operationsQuery.isFetching}
          >
            {isFetching || operationsQuery.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-1">새로고침</span>
          </Button>
        }
      />

      <div
        role="tablist"
        aria-label="멤버 게시글 수집 소스"
        className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/25 p-1"
      >
        {SOURCE_TABS.map((tab) => {
          const active = activeSource === tab.value;
          return (
            <Button
              key={tab.value}
              id={`member-post-tab-${tab.value}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`member-post-panel-${tab.value}`}
              variant={active ? "default" : "ghost"}
              className="h-9 justify-center gap-2 px-3 text-center"
              onClick={() => setActiveSource(tab.value)}
            >
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", active ? "bg-background/15" : "bg-background")}>
                {tab.value === "x" ? (
                  <img src={IconX} alt="" className="h-4 w-4" />
                ) : (
                  <Coffee className="h-4 w-4 text-emerald-600" />
                )}
              </span>
              <span className="truncate text-sm font-semibold">{tab.label}</span>
            </Button>
          );
        })}
      </div>

      {isFetching && !settings ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          설정 불러오는 중...
        </div>
      ) : (
        <div
          id={`member-post-panel-${activeSource}`}
          role="tabpanel"
          aria-labelledby={`member-post-tab-${activeSource}`}
          className="space-y-5"
        >
          {activeSource === "x" ? (
            <MemberPostFeedMonitor
              source="x"
              xCollectionEnabled={isXCollectionEnabled}
              xPostsVisibility={xPostsVisibility}
              naverCafeEnabled={isNaverCafePostsEnabled}
              naverCafeVisibility={naverCafePostsVisibility}
              operationsStatus={operationsQuery.data ?? null}
              operationsLoading={operationsQuery.isLoading}
              operationsError={operationsQuery.isError}
              onReloadOperations={() => operationsQuery.refetch()}
              onRunXCollection={() => void handleRunXCollectionNow()}
              isRunningXCollection={isRunningCollection}
            >
            <div className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">수집 설정</h3>
                <p className="text-xs text-muted-foreground">공개 범위, 자동 수집과 비용 영향 옵션을 관리합니다.</p>
              </div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">X 게시글 공개 범위</CardTitle>
              <CardDescription>
                X 게시글의 사용자 피드 공개 범위입니다. 수집 활성 여부는 아래에서 별도로 관리합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ButtonGroup className="flex w-full flex-col sm:flex-row">
                {VISIBILITY_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const active = xPostsVisibility === option.value;
                  return (
                    <Button
                      key={option.value}
                      type="button"
                      variant={active ? "default" : "outline"}
                      className="h-auto flex-1 justify-start gap-3 px-4 py-3 text-left"
                      onClick={() => void handleVisibilityChange(option.value)}
                      disabled={!settings || isSaving}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">
                          {option.label}
                        </span>
                        <span className="block whitespace-normal text-xs font-normal opacity-75">
                          {option.description}
                        </span>
                      </span>
                    </Button>
                  );
                })}
              </ButtonGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <DatabaseZap className="h-4 w-4 text-muted-foreground" />
                    X 백그라운드 수집
                  </CardTitle>
                  <CardDescription>
                    방문자 요청과 X API 호출을 분리하고 D1 저장 데이터만 표시합니다.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="w-fit">
                  비용 제한
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <Label
                    htmlFor="x-collection-enabled"
                    className="text-sm font-semibold"
                  >
                    Cron 수집 사용
                  </Label>
                  <p className="text-sm leading-6 text-muted-foreground">
                    저장된 게시글을 우선 표시하고, 정기 수집에서만 X API를 호출합니다.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {isXCollectionEnabled ? (
                    <Badge variant="default" className="bg-green-600">
                      활성화
                    </Badge>
                  ) : (
                    <Badge variant="secondary">비활성</Badge>
                  )}
                  <Switch
                    id="x-collection-enabled"
                    checked={isXCollectionEnabled}
                    onCheckedChange={handleToggleXCollection}
                    disabled={!settings || isSaving}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <Label
                    htmlFor="x-daily-budget"
                    className="text-sm font-semibold"
                  >
                    일일 예산 센트
                  </Label>
                  <p className="text-sm leading-6 text-muted-foreground">
                    UTC 하루 기준 추정 사용액이 예산에 도달하면 추가 수집을 멈춥니다.
                  </p>
                </div>
                <div className="flex w-full shrink-0 gap-2 sm:w-48">
                  <Input
                    id="x-daily-budget"
                    inputMode="numeric"
                    value={budgetDraft}
                    onChange={(event) => setBudgetDraft(event.target.value)}
                    disabled={!settings || isSaving}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleSaveBudget()}
                    disabled={!settings || isSaving}
                  >
                    저장
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 rounded-md border bg-muted/20 p-3 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
                <div className="min-w-0 space-y-1">
                  <Label
                    htmlFor="x-collection-interval"
                    className="flex items-center gap-2 text-sm font-semibold"
                  >
                    <Clock3 className="h-4 w-4 text-muted-foreground" />
                    수집 주기
                  </Label>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Cron은 매시 실행되며, 설정한 주기가 지난 경우에만 X API를 호출합니다.
                  </p>
                </div>
                <Select
                  value={xCollectionInterval}
                  onValueChange={(value) =>
                    void handleXCollectionIntervalChange(value)
                  }
                  disabled={!settings || isSaving}
                >
                  <SelectTrigger
                    id="x-collection-interval"
                    className="w-full"
                    size="sm"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {X_COLLECTION_INTERVAL_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0 space-y-1">
                  <Label className="text-sm font-semibold">수집 실행</Label>
                  <p className="text-sm leading-6 text-muted-foreground">
                    마지막 실행:{" "}
                    <span className="font-medium text-foreground">
                      {formatCollectionLastRun(settings?.x_collection_last_run)}
                    </span>
                  </p>
                  {collectionRunQuery.data?.jobType === "x_collection" ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge>{collectionRunQuery.data.status}</Badge>
                      <span>
                        완료 {collectionRunQuery.data.progress.succeeded}/
                        {collectionRunQuery.data.progress.total}
                      </span>
                      <span>실패 {collectionRunQuery.data.progress.failed}</span>
                      <span>대기 {collectionRunQuery.data.progress.queued}</span>
                    </div>
                  ) : collectionRun?.jobType === "x_collection" ? (
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      실행 상태를 확인하고 있습니다.
                    </div>
                  ) : null}
                </div>
                <Badge variant="outline" className="w-fit">수동 실행은 상단에서 시작합니다.</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MessageSquareText className="h-4 w-4 text-muted-foreground" />
                    X 게시글 링크 프리뷰
                  </CardTitle>
                  <CardDescription>
                    링크된 X 게시글의 작성자, 본문과 미디어를 추가 API 호출로 가져옵니다.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="w-fit">
                  비용 영향 옵션
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <Label
                    htmlFor="x-rich-link-preview-enabled"
                    className="text-sm font-semibold"
                  >
                    링크된 X 게시글 내용 표시
                  </Label>
                  <p className="text-sm leading-6 text-muted-foreground">
                    게시글 안의 X 링크를 카드형 미리보기로 표시합니다. 켜면
                    tweet lookup 호출과 API 비용이 늘 수 있습니다.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge
                    variant={isRichXLinkPreviewEnabled ? "default" : "secondary"}
                    className={isRichXLinkPreviewEnabled ? "bg-emerald-600" : undefined}
                  >
                    {isRichXLinkPreviewEnabled ? "활성화" : "비활성"}
                  </Badge>
                  <Switch
                    id="x-rich-link-preview-enabled"
                    checked={isRichXLinkPreviewEnabled}
                    onCheckedChange={handleToggleRichXLinkPreview}
                    disabled={!settings || isSaving}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

            </div>
            </MemberPostFeedMonitor>
          ) : (
            <MemberPostFeedMonitor
              source="naver-cafe"
              xCollectionEnabled={isXCollectionEnabled}
              xPostsVisibility={xPostsVisibility}
              naverCafeEnabled={isNaverCafePostsEnabled}
              naverCafeVisibility={naverCafePostsVisibility}
              operationsStatus={operationsQuery.data ?? null}
              operationsLoading={operationsQuery.isLoading}
              operationsError={operationsQuery.isError}
              onReloadOperations={() => operationsQuery.refetch()}
              onRunNaverCafeCheck={() => void handleRunNaverCafeCheck()}
              isRunningNaverCafeCheck={isRunningNaverCafeCheck}
            >
            <div className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">수집 설정과 게시판 소스</h3>
                <p className="text-xs text-muted-foreground">피드 공개 범위와 수집할 게시판을 관리합니다.</p>
              </div>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Coffee className="h-4 w-4 text-muted-foreground" />
                    네이버 카페 최신글
                  </CardTitle>
                  <CardDescription>
                    네이버 카페 최신글의 사용자 피드 표시 여부와 공개 범위를 설정합니다.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="w-fit">
                  내부 게시판 목록 API
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <Label
                    htmlFor="naver-cafe-posts-enabled"
                    className="text-sm font-semibold"
                  >
                    카페 최신글 표시
                  </Label>
                  <p className="text-sm leading-6 text-muted-foreground">
                    공개 접근 가능한 네이버 카페 게시판 목록에서 제목, 요약, 작성일,
                    대표 이미지만 가져옵니다. 꺼도 관리자 모니터링은 유지됩니다.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {isNaverCafePostsEnabled ? (
                    <Badge variant="default" className="bg-green-600">
                      활성화
                    </Badge>
                  ) : (
                    <Badge variant="secondary">비활성</Badge>
                  )}
                  <Switch
                    id="naver-cafe-posts-enabled"
                    checked={isNaverCafePostsEnabled}
                    onCheckedChange={handleToggleNaverCafePosts}
                    disabled={!settings || isSaving}
                  />
                </div>
              </div>

              <ButtonGroup className="flex w-full flex-col sm:flex-row">
                {VISIBILITY_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const active = naverCafePostsVisibility === option.value;
                  return (
                    <Button
                      key={option.value}
                      type="button"
                      variant={active ? "default" : "outline"}
                      className="h-auto flex-1 justify-start gap-3 px-4 py-3 text-left"
                      onClick={() =>
                        void handleNaverCafeVisibilityChange(
                          option.value as NaverCafePostsVisibility,
                        )
                      }
                      disabled={!settings || isSaving || !isNaverCafePostsEnabled}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">
                          {option.label}
                        </span>
                        <span className="block whitespace-normal text-xs font-normal opacity-75">
                          {option.description}
                        </span>
                      </span>
                    </Button>
                  );
                })}
              </ButtonGroup>
            </CardContent>
          </Card>

          <NaverCafeSourceManager />
            </div>
            </MemberPostFeedMonitor>
          )}
        </div>
      )}
    </section>
  );
}
