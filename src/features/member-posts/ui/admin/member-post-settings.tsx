import { AdminSectionHeader } from "@/app/admin";
import IconX from "@/assets/icon_x.svg";
import {
  fetchSettings,
  isXCollectionIntervalHours,
  isXReferencePreviewMode,
  normalizeXCollectionIntervalHours,
  updateSettings,
  X_COLLECTION_INTERVAL_HOURS,
  type AutoUpdateSettings,
} from "@/features/configuration";
import { NaverCafeSourceManager } from "@/features/naver-cafe";
import {
  fetchOperationsStatus,
  runNaverCafeCheckNow,
  runXCollectionNow,
  useOperationRun,
  type OperationRunAccepted
} from "@/features/operations";
import { useUnsavedChanges } from "@/shared/lib/unsaved-changes";
import { queryKeys } from "@/shared/query/query-keys";
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
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Switch } from "@/shared/ui/switch";
import { TabsList } from "@/shared/ui/tabs-list";
import { useToast } from "@/shared/ui/toast";
import type { NaverCafePostsVisibility } from "@contracts/naver-cafe";
import type { XPostsVisibility } from "@contracts/x-posts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock3,
  Coffee,
  EyeOff,
  Globe2,
  Loader2,
  LockKeyhole,
  RefreshCw
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { xReferenceHealthQueryKey } from "../../queries/use-x-reference-health";
import {
  MemberPostFeedMonitor,
  type MemberPostSource,
} from "./member-post-feed-monitor";
import { XPostHistoryManager } from "./x-post-history-manager";
import { openXSettings } from "./x-settings-navigation";

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
    label: value === "0.5" ? "30분마다" : `${value}시간마다`,
  }),
);

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

export function MemberPostSettingsManager({
  activeSource: controlledActiveSource,
  onActiveSourceChange,
}: {
  activeSource?: MemberPostSource;
  onActiveSourceChange?: (source: MemberPostSource) => void;
}) {
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
  const [budgetEdited, setBudgetEdited] = useState(false);
  const [previewBudgetEdited, setPreviewBudgetEdited] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState("100");
  const [previewBudgetDraft, setPreviewBudgetDraft] = useState("10");
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
  useUnsavedChanges(Boolean(settings && (
    (budgetEdited && budgetDraft !== settings.x_collection_daily_budget_cents) ||
    (previewBudgetEdited && previewBudgetDraft !== settings.x_reference_preview_daily_budget_cents)
  )));
  useEffect(() => {
    if (activeSource !== "x") return;
    let observer: MutationObserver | undefined;
    const openHash = () => {
      observer?.disconnect();
      const id = window.location.hash.slice(1);
      if (id !== "x-collection-settings" && id !== "x-reference-settings" && id !== "x-feed-settings") return;
      const openWhenMounted = () => {
        if (!document.getElementById(id)) return;
        observer?.disconnect();
        openXSettings(id);
      };
      // The tab panel can mount after its parent's effect (or after loading).
      observer = new MutationObserver(openWhenMounted);
      observer.observe(document.body, {childList: true, subtree: true});
      openWhenMounted();
    };
    openHash();
    window.addEventListener("hashchange", openHash);
    return () => { observer?.disconnect(); window.removeEventListener("hashchange", openHash); };
  }, [activeSource]);
  const isFetching = settingsQuery.isFetching;

  const patchSettings = useCallback(
    async (patch: Partial<AutoUpdateSettings>) => {
      queryClient.setQueryData<AutoUpdateSettings>(
        queryKeys.settings.detail(),
        (current: AutoUpdateSettings | undefined) =>
          current ? { ...current, ...patch } : current,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.operations.all }),
        queryClient.invalidateQueries({ queryKey: xReferenceHealthQueryKey }),
      ]);
    },
    [queryClient],
  );

  const loadSettings = useCallback(async () => {
    try {
      await Promise.all([
        settingsQuery.refetch(), operationsQuery.refetch(),
        queryClient.refetchQueries({ queryKey: queryKeys.operations.runs(), type: "active" }),
        queryClient.refetchQueries({ queryKey: xReferenceHealthQueryKey, type: "active" }),
      ]);

    } catch (error) {
      console.error("Failed to load member post settings:", error);
      toast({
        variant: "error",
        description: "멤버 게시글 관리 설정을 불러오지 못했습니다.",
      });
    }
  }, [operationsQuery, settingsQuery, queryClient, toast]);

  useEffect(() => {
    if (!budgetEdited) setBudgetDraft(settings?.x_collection_daily_budget_cents ?? "100");
  }, [settings?.x_collection_daily_budget_cents, budgetEdited]);

  useEffect(() => {
    if (!previewBudgetEdited) setPreviewBudgetDraft(settings?.x_reference_preview_daily_budget_cents ?? "10");
  }, [settings?.x_reference_preview_daily_budget_cents, previewBudgetEdited]);

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
  const isXHistoryAnalyticsEnabled =
    settings?.x_history_analytics_enabled !== "false";
  const xPostsVisibility = settings?.x_posts_visibility ?? "members";
  const isNaverCafePostsEnabled =
    settings?.naver_cafe_posts_enabled !== "false";
  const isNaverCafeCollectionEnabled =
    settings?.naver_cafe_collection_enabled !== "false";
  const naverCafePostsVisibility =
    settings?.naver_cafe_posts_visibility ?? "members";
  const isXCollectionEnabled = settings?.x_collection_enabled !== "false";
  const isXCostOptimizerEnabled = settings?.x_cost_optimizer_enabled === "true";
  const xReferencePreviewMode = settings?.x_reference_preview_mode ?? "cached_author";
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
      await patchSettings({ x_posts_visibility: visibility });
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
      await patchSettings({
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

  const handleToggleXCostOptimizer = async (enabled: boolean) => {
    if (!settings) return;
    setIsSaving(true);
    try {
      const value = enabled ? "true" : "false";
      await updateSettings({ x_cost_optimizer_enabled: value });
      await patchSettings({ x_cost_optimizer_enabled: value });
      toast({
        variant: "success",
        description: enabled
          ? "X API 비용 최적화를 활성화했습니다."
          : "X API 비용 최적화를 비활성화했습니다.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleXReferencePreviewModeChange = async (mode: string) => {
    if (!settings || !isXReferencePreviewMode(mode)) return;
    setIsSaving(true);
    try {
      await updateSettings({ x_reference_preview_mode: mode });
      await patchSettings({ x_reference_preview_mode: mode });
      toast({ variant: "success", description: "X 참조 미리보기 비용 모드를 저장했습니다." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveXReferencePreviewBudget = async () => {
    if (!settings) return;
    const value = String(Math.min(Math.max(Number.parseInt(previewBudgetDraft, 10) || 0, 0), 100));
    setIsSaving(true);
    try {
      await updateSettings({ x_reference_preview_daily_budget_cents: value });
      await patchSettings({ x_reference_preview_daily_budget_cents: value });
      setPreviewBudgetDraft(value);
      setPreviewBudgetEdited(false);
      toast({ variant: "success", description: "X 미리보기 일일 예산을 저장했습니다." });
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
      await patchSettings({
        x_collection_daily_budget_cents: normalized,
      });
      setBudgetDraft(normalized);
      setBudgetEdited(false);
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
      await patchSettings({
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.operations.runs() });
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
      await patchSettings({
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

  const handleToggleXHistoryAnalytics = async (enabled: boolean) => {
    if (!settings) return;
    setIsSaving(true);
    try {
      await updateSettings({
        x_history_analytics_enabled: enabled ? "true" : "false",
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.settings.detail(),
      });
      await patchSettings({
        x_history_analytics_enabled: enabled ? "true" : "false",
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.memberPosts.all,
      });
      toast({
        variant: "success",
        description: enabled
          ? "X 기록 색인과 관리자 아카이브를 활성화했습니다. 누락 항목은 수집 실행마다 보충됩니다."
          : "X 기록 색인을 중지했습니다. 신규 게시물 원본 수집은 계속됩니다.",
      });
    } catch (error) {
      console.error("Failed to update X history analytics setting:", error);
      toast({
        variant: "error",
        description: "X 기록 분석 설정 변경에 실패했습니다.",
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
      await patchSettings({
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

  const handleToggleNaverCafeCollection = async (enabled: boolean) => {
    if (!settings) return;
    setIsSaving(true);
    try {
      await updateSettings({
        naver_cafe_collection_enabled: enabled ? "true" : "false",
      });
      await patchSettings({
        naver_cafe_collection_enabled: enabled ? "true" : "false",
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail() });
      toast({
        variant: "success",
        description: enabled
          ? "네이버 카페 외부 수집을 활성화했습니다."
          : "네이버 카페 외부 수집을 즉시 중지했습니다.",
      });
    } catch (error) {
      console.error("Failed to update Naver collection kill switch:", error);
      toast({ variant: "error", description: "네이버 수집 킬스위치 변경에 실패했습니다." });
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
      await patchSettings({
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
    <section className="space-y-3">
      <AdminSectionHeader
        title="멤버 게시글 관리"
        description="수집 소스별 설정, 비용과 실제 운영 상태를 한 화면에서 관리합니다."
        actions={
          <Button
            aria-label="멤버 게시글 운영 정보 새로고침"
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

      {!controlledActiveSource && <TabsList value={activeSource} onValueChange={setActiveSource} label="멤버 게시글 수집 소스"
        items={SOURCE_TABS.map((tab) => ({ value: tab.value, id: `member-post-tab-${tab.value}`, panelId: `member-post-panel-${tab.value}`,
          label: <><span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-background">
            {tab.value === "x" ? <img src={IconX} alt="" className="size-4" /> : <Coffee className="size-4 text-emerald-600" />}
          </span>{tab.label}</> }))} />}

      {isFetching && !settings ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          설정 불러오는 중...
        </div>
      ) : (
        <div
          id={`member-post-panel-${activeSource}`}
          role={controlledActiveSource ? "region" : "tabpanel"}
          aria-label={controlledActiveSource ? SOURCE_TABS.find((tab) => tab.value === activeSource)?.label : undefined}
          aria-labelledby={controlledActiveSource ? undefined : `member-post-tab-${activeSource}`}
          className="space-y-3"
        >
          {activeSource === "x" ? (
            <MemberPostFeedMonitor
              source="x"
              xCollectionEnabled={isXCollectionEnabled}
              xPostsVisibility={xPostsVisibility}
              naverCafeEnabled={isNaverCafePostsEnabled}
              naverCafeVisibility={naverCafePostsVisibility}
              operationsStatus={operationsQuery.data ?? null}
              operationsLoading={operationsQuery.isLoading || settingsQuery.isLoading}
              operationsError={operationsQuery.isError || settingsQuery.isError}
              onReloadOperations={loadSettings}
              onRunXCollection={settings ? () => void handleRunXCollectionNow() : undefined}
              isRunningXCollection={isRunningCollection || (
                collectionRun?.jobType === "x_collection" &&
                (!collectionRunQuery.data || ["queued", "running"].includes(collectionRunQuery.data.status))
              )}
            >
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">수집 설정</h3>
              <details id="x-feed-settings" className="rounded-lg border">
                <summary className="cursor-pointer px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">공개·피드 설정<span className="ml-2 text-xs font-normal text-muted-foreground">접근 범위와 피드 미리보기</span></summary>
                <div className="space-y-3 border-t p-3">
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
                      className="h-auto flex-1 justify-start gap-3 px-3 py-2 text-left"
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


              <div className="border-t pt-3">
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
              </div>
              <div className="border-t pt-3">
                <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <Label htmlFor="x-history-analytics-enabled" className="text-sm font-semibold">
                      관리자 영구 아카이브 색인
                    </Label>
                    <p className="text-sm leading-6 text-muted-foreground">
                      꺼도 신규 게시물 원본 수집과 영구 보존은 계속됩니다. 다시 켜면 공급자 호출 없이 D1 원문에서 누락 색인을 보충합니다.
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Badge variant={isXHistoryAnalyticsEnabled ? "default" : "secondary"}>
                      {isXHistoryAnalyticsEnabled ? "활성화" : "비활성"}
                    </Badge>
                    <Switch
                      id="x-history-analytics-enabled"
                      checked={isXHistoryAnalyticsEnabled}
                      onCheckedChange={handleToggleXHistoryAnalytics}
                      disabled={!settings || isSaving}
                    />
                  </div>
                </div>
              </div>

                </div>
              </details>
              <details id="x-collection-settings" className="rounded-lg border">
                <summary className="cursor-pointer px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">게시물 수집 설정<span className="ml-2 text-xs font-normal text-muted-foreground">자동 수집·주기·전체 예산</span></summary>
                <div className="space-y-3 border-t p-3">

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
                    전체 X 일일 예산 센트
                  </Label>
                  <p className="text-sm leading-6 text-muted-foreground">
                    게시물 수집과 원문 보강이 공유하는 전체 예산입니다. UTC 하루 기준으로 적용합니다.
                  </p>
                </div>
                <div className="flex w-full shrink-0 gap-2 sm:w-48">
                  <Input
                    id="x-daily-budget"
                    inputMode="numeric"
                    value={budgetDraft}
                    onChange={(event) => { setBudgetEdited(true); setBudgetDraft(event.target.value); }}
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
              <div className="grid gap-3 rounded-md border bg-muted/20 p-3 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center">
                <div className="min-w-0 space-y-1">
                  <Label htmlFor="x-cost-optimizer" className="text-sm font-semibold">
                    X API 비용 최적화
                  </Label>
                  <p className="text-sm leading-6 text-muted-foreground">
                    첫 페이지를 5건으로 제한하고 신규행만 저장합니다. 사용량 70% 또는 공급자 backoff에서는 설정 주기와 최소 1시간 중 긴 주기를 적용합니다.
                  </p>
                </div>
                <div className="flex items-center justify-end gap-3">
                  <Badge variant={isXCostOptimizerEnabled ? "default" : "secondary"}>
                    {isXCostOptimizerEnabled ? "활성화" : "비활성"}
                  </Badge>
                  <Switch
                    id="x-cost-optimizer"
                    checked={isXCostOptimizerEnabled}
                    onCheckedChange={handleToggleXCostOptimizer}
                    disabled={!settings || isSaving}
                  />
                </div>
              </div>

                </div>
              </details>
              <details id="x-reference-settings" className="rounded-lg border">
                <summary className="cursor-pointer px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">원문 보강 설정<span className="ml-2 text-xs font-normal text-muted-foreground">미리보기 모드·보강 예산</span></summary>
                <div className="space-y-3 border-t p-3">
              <div className="grid gap-3 rounded-md border bg-muted/20 p-3 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
                <div className="min-w-0 space-y-1">
                  <Label htmlFor="x-reference-preview-mode" className="text-sm font-semibold">
                    인용 원문 미리보기 모드
                  </Label>
                  <p className="text-sm leading-6 text-muted-foreground">
                    인용 작성자 캐시는 30일 재사용합니다. 비용 비상 시 인용 게시글만 또는 링크만 표시할 수 있습니다.
                  </p>
                </div>
                <Select
                  value={xReferencePreviewMode}
                  onValueChange={(value) => void handleXReferencePreviewModeChange(value)}
                  disabled={!settings || isSaving}
                >
                  <SelectTrigger id="x-reference-preview-mode" className="w-full" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cached_author">작성자 캐시</SelectItem>
                    <SelectItem value="post_only">게시글만</SelectItem>
                    <SelectItem value="link_only">링크만</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <Label htmlFor="x-preview-budget" className="text-sm font-semibold">
                    인용 보강 일일 예산 센트
                  </Label>
                  <p className="text-sm leading-6 text-muted-foreground">
                    기본 10센트입니다. 신규 수집을 우선하며, 예산이 소진된 인용 보강은 다음 UTC 일로 이월합니다. 저장된 원문 연결에는 X 비용이 들지 않습니다.
                  </p>
                </div>
                <div className="flex w-full shrink-0 gap-2 sm:w-48">
                  <Input
                    id="x-preview-budget"
                    inputMode="numeric"
                    value={previewBudgetDraft}
                    onChange={(event) => { setPreviewBudgetEdited(true); setPreviewBudgetDraft(event.target.value); }}
                    disabled={!settings || isSaving}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleSaveXReferencePreviewBudget()}
                    disabled={!settings || isSaving}
                  >
                    저장
                  </Button>
                </div>
              </div>

                </div>
              </details>
              <p className="rounded-md border bg-muted/20 p-3 text-sm leading-6">
                <strong>답글 표시 정책</strong><br />
                저장된 미리보기 유지 · 미확보 원문은 관계와 링크 표시 · 추가 X 조회 없음
              </p>
              <XPostHistoryManager enabled={isXHistoryAnalyticsEnabled} />
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
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <Label htmlFor="naver-cafe-collection-enabled" className="text-sm font-semibold">
                    관리자 수집 킬스위치
                  </Label>
                  <p className="text-sm leading-6 text-muted-foreground">
                    scheduled·manual·queue의 네이버 외부 요청만 중지합니다. 저장된 피드는 계속 제공됩니다.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge variant={isNaverCafeCollectionEnabled ? "default" : "destructive"}>
                    {isNaverCafeCollectionEnabled ? "수집 중" : "수집 중지"}
                  </Badge>
                  <Switch
                    id="naver-cafe-collection-enabled"
                    checked={isNaverCafeCollectionEnabled}
                    onCheckedChange={handleToggleNaverCafeCollection}
                    disabled={!settings || isSaving}
                  />
                </div>
              </div>
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
                      className="h-auto flex-1 justify-start gap-3 px-3 py-2 text-left"
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
