import { useXCollectionStatus } from "../../queries/use-x-collection-status";
import IconX from "@/assets/icon_x.svg";
import {
  fetchSettings,
  updateSettings,
  type AutoUpdateSettings,
} from "@/features/configuration";
import {
  fetchOperationsStatus,
  runNaverCafeCheckNow,
  runXCollectionNow,
  useOperationRun,
  type OperationRunAccepted
} from "@/features/operations";
import { queryKeys } from "@/shared/query/query-keys";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { ButtonGroup } from "@/shared/ui/button-group";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/shared/ui/card";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import { TabsList } from "@/shared/ui/tabs-list";
import { useToast } from "@/shared/ui/toast";
import type { NaverCafePostsVisibility } from "@contracts/naver-cafe";
import type { XPostsVisibility } from "@contracts/x-posts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PiCoffeeBold as Coffee, PiEyeSlashBold as EyeOff, PiGlobeBold as Globe2, PiSpinnerGapBold as Loader2, PiLockKeyBold as LockKeyhole } from "react-icons/pi";
import { useCallback, useEffect, useState } from "react";
import { xReferenceHealthQueryKey } from "../../queries/use-x-reference-health";
import {
  MemberPostFeedMonitor,
  type MemberPostSource,
} from "./member-post-feed-monitor";
import { xActivityQueryKey } from "../../api/x-activity-api";
import { xCollectionQueryKey } from "../../api/x-collection-api";

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
  const collectionSourceQuery = useXCollectionStatus(activeSource === "x");
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
        queryClient.invalidateQueries({ queryKey: xActivityQueryKey }),
        queryClient.invalidateQueries({ queryKey: xCollectionQueryKey }),
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
        queryClient.refetchQueries({ queryKey: xActivityQueryKey, type: "active" }),
        queryClient.refetchQueries({ queryKey: xCollectionQueryKey, type: "active" }),
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
    const run = collectionRunQuery.data;
    if (!run || !["succeeded", "partial", "failed", "skipped", "throttled"].includes(run.status)) {
      return;
    }
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.operations.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.memberPosts.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.all }),
      queryClient.invalidateQueries({ queryKey: xActivityQueryKey }),
      queryClient.invalidateQueries({ queryKey: xCollectionQueryKey }),
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

  const handleRunXCollectionNow = async () => {
    if (!settings) return;
    setIsRunningCollection(true);
    try {
      const accepted = await runXCollectionNow(undefined, collectionSourceQuery.data?.primarySource);
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
              naverCafeEnabled={isNaverCafePostsEnabled}
              naverCafeVisibility={naverCafePostsVisibility}
              operationsStatus={operationsQuery.data ?? null}
              operationsLoading={operationsQuery.isLoading || settingsQuery.isLoading}
              operationsError={operationsQuery.isError || settingsQuery.isError}
              operationsUpdatedAt={operationsQuery.dataUpdatedAt}
              onReloadOperations={loadSettings}
              onRunXCollection={settings && collectionSourceQuery.data && !collectionSourceQuery.isError ? () => void handleRunXCollectionNow() : undefined}
              isRunningXCollection={isRunningCollection || (
                collectionRun?.jobType === "x_collection" &&
                (!collectionRunQuery.data || ["queued", "running"].includes(collectionRunQuery.data.status))
              )}
            >
              <Card id="x-feed-settings" role="region" aria-labelledby="x-feed-settings-title" className="gap-0 py-0 shadow-none">
                <CardHeader className="border-b px-3 py-2 [.border-b]:pb-2">
                  <h2 id="x-feed-settings-title" className="text-sm font-semibold">피드 설정</h2>
                </CardHeader>
                <CardContent className="divide-y px-3">
                  <div className="space-y-2 py-3">
                    <h3 className="text-sm font-semibold">X 게시글 공개 범위</h3>
                    <ButtonGroup className="flex w-full flex-col sm:flex-row">
                      {VISIBILITY_OPTIONS.map(({ value, label, description, icon: Icon }) => (
                        <Button
                          key={value}
                          type="button"
                          variant={xPostsVisibility === value ? "default" : "outline"}
                          className="h-auto flex-1 justify-start gap-3 px-3 py-2 text-left"
                          onClick={() => void handleVisibilityChange(value)}
                          disabled={!settings || isSaving}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold">{label}</span>
                            <span className="block whitespace-normal text-xs font-normal opacity-75">{description}</span>
                          </span>
                        </Button>
                      ))}
                    </ButtonGroup>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                    <div className="min-w-0 space-y-1">
                      <Label htmlFor="x-rich-link-preview-enabled" className="text-sm font-semibold">링크된 X 게시글 내용 표시</Label>
                      <p className="text-xs text-muted-foreground">
                        X 링크에 미리보기를 표시합니다. API 비용이 늘 수 있습니다.
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Badge variant={isRichXLinkPreviewEnabled ? "default" : "secondary"} className={isRichXLinkPreviewEnabled ? "bg-emerald-600" : undefined}>
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
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                    <div className="min-w-0 space-y-1">
                      <Label htmlFor="x-history-analytics-enabled" className="text-sm font-semibold">관리자 영구 아카이브 색인</Label>
                      <p className="text-xs text-muted-foreground">
                        원본은 계속 보존하며, 다시 켜면 저장된 원본으로 색인을 보충합니다.
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
                </CardContent>
              </Card>
            </MemberPostFeedMonitor>
          ) : (
            <MemberPostFeedMonitor
              source="naver-cafe"
              xCollectionEnabled={isXCollectionEnabled}
              naverCafeEnabled={isNaverCafePostsEnabled}
              naverCafeVisibility={naverCafePostsVisibility}
              operationsStatus={operationsQuery.data ?? null}
              operationsLoading={operationsQuery.isLoading}
              operationsError={operationsQuery.isError}
              operationsUpdatedAt={operationsQuery.dataUpdatedAt}
              onReloadOperations={loadSettings}
              onRunNaverCafeCheck={() => void handleRunNaverCafeCheck()}
              isRunningNaverCafeCheck={isRunningNaverCafeCheck}
            >
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <Label htmlFor="naver-cafe-collection-enabled" className="text-sm font-semibold">
                    외부 수집
                  </Label>
                  <p className="text-sm leading-6 text-muted-foreground">
                    중지 시에도 저장된 피드는 유지됩니다.
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
              <div className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <Label
                    htmlFor="naver-cafe-posts-enabled"
                    className="text-sm font-semibold"
                  >
                    카페 최신글 표시
                  </Label>
                  <p className="text-sm leading-6 text-muted-foreground">
                    사용자 피드 표시 · 꺼도 관리자 점검은 유지됩니다.
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
            </div>
            </MemberPostFeedMonitor>
          )}
        </div>
      )}
    </section>
  );
}
