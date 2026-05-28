import { useCallback, useEffect, useState } from "react";
import {
  Clock3,
  DatabaseZap,
  EyeOff,
  Globe2,
  Coffee,
  Loader2,
  LockKeyhole,
  MessageSquareText,
  Play,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import {
  fetchSettings,
  runXCollectionNow,
  updateSettings,
  type AutoUpdateSettings,
  type XCollectionRunResult,
} from "@/lib/api/settings";
import {
  isXCollectionIntervalHours,
  normalizeXCollectionIntervalHours,
  X_COLLECTION_INTERVAL_HOURS,
} from "@/lib/auto-update-interval";
import { X_POSTS_CONFIG_UPDATED_EVENT } from "@/hooks/use-x-posts-config";
import { NAVER_CAFE_POSTS_CONFIG_UPDATED_EVENT } from "@/hooks/use-naver-cafe-posts-config";
import type { NaverCafePostsVisibility, XPostsVisibility } from "@/lib/types";
import { AdminSectionHeader } from "./components/admin-section-header";
import { MemberPostFeedMonitor } from "./member-post-feed-monitor";
import { NaverCafeSourceManager } from "./naver-cafe-source-manager";

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
    description: "메뉴를 숨기고 피드/API 접근을 차단합니다.",
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

const formatEstimatedCost = (micros: number) =>
  `$${(micros / 1_000_000).toFixed(4)}`;

const getCollectionStatusLabel = (status: XCollectionRunResult["status"]) => {
  if (status === "success") return "완료";
  if (status === "skipped") return "건너뜀";
  return "실패";
};

export function MemberPostSettingsManager() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<AutoUpdateSettings | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunningCollection, setIsRunningCollection] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState("100");
  const [collectionResult, setCollectionResult] =
    useState<XCollectionRunResult | null>(null);

  const loadSettings = useCallback(async () => {
    setIsFetching(true);
    try {
      const data = await fetchSettings();
      setSettings(data);
      setBudgetDraft(data.x_collection_daily_budget_cents ?? "100");
      setCollectionResult(null);
    } catch (error) {
      console.error("Failed to load member post settings:", error);
      toast({
        variant: "error",
        description: "멤버 게시글 관리 설정을 불러오지 못했습니다.",
      });
    } finally {
      setIsFetching(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

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
      setSettings({
        ...settings,
        x_posts_visibility: visibility,
      });
      window.dispatchEvent(
        new CustomEvent(X_POSTS_CONFIG_UPDATED_EVENT, {
          detail: { visibility },
        }),
      );
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
      setSettings({
        ...settings,
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
      setSettings({
        ...settings,
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
      setSettings({
        ...settings,
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
      const result = await runXCollectionNow();
      setCollectionResult(result);
      setSettings({
        ...settings,
        x_collection_last_run:
          result.status === "success" || result.status === "failed"
            ? String(Date.parse(result.updatedAt))
            : settings.x_collection_last_run,
      });
      toast({
        variant:
          result.status === "success"
            ? "success"
            : result.status === "skipped"
              ? "info"
              : "error",
        description:
          result.status === "success"
            ? `X 게시글 ${result.postsStored}개를 저장했습니다.`
            : result.status === "skipped"
              ? "X 게시글 수집이 설정에 의해 건너뛰어졌습니다."
              : `X 게시글 수집에 실패했습니다: ${result.error ?? "원인 확인 필요"}`,
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

  const handleToggleRichXLinkPreview = async (enabled: boolean) => {
    if (!settings) return;
    setIsSaving(true);
    try {
      await updateSettings({
        x_rich_link_preview_enabled: enabled ? "true" : "false",
      });
      setSettings({
        ...settings,
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
      setSettings({
        ...settings,
        naver_cafe_posts_enabled: enabled ? "true" : "false",
      });
      window.dispatchEvent(
        new CustomEvent(NAVER_CAFE_POSTS_CONFIG_UPDATED_EVENT, {
          detail: { enabled },
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
      setSettings({
        ...settings,
        naver_cafe_posts_visibility: visibility,
      });
      window.dispatchEvent(
        new CustomEvent(NAVER_CAFE_POSTS_CONFIG_UPDATED_EVENT, {
          detail: { visibility },
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
        description="멤버 최신 게시글 피드에서 API 비용이 발생할 수 있는 표시 옵션을 관리합니다."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadSettings()}
            disabled={isFetching}
          >
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-1">새로고침</span>
          </Button>
        }
      />

      {isFetching && !settings ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          설정 불러오는 중...
        </div>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">X 게시글 공개 범위</CardTitle>
              <CardDescription>
                사이트 헤더의 멤버 게시글 메뉴와 /feed 접근 권한을 설정합니다.
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
              <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
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
              <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-4 sm:flex-row sm:items-end sm:justify-between">
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
              <div className="grid gap-3 rounded-md border bg-muted/20 p-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
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
              <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0 space-y-1">
                  <Label className="text-sm font-semibold">수집 실행</Label>
                  <p className="text-sm leading-6 text-muted-foreground">
                    마지막 실행:{" "}
                    <span className="font-medium text-foreground">
                      {formatCollectionLastRun(settings?.x_collection_last_run)}
                    </span>
                  </p>
                  {collectionResult ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge
                        variant={
                          collectionResult.status === "success"
                            ? "default"
                            : collectionResult.status === "skipped"
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {getCollectionStatusLabel(collectionResult.status)}
                      </Badge>
                      <span>확인 {collectionResult.checkedHandles}개</span>
                      <span>새로고침 {collectionResult.refreshedHandles}개</span>
                      <span>저장 {collectionResult.postsStored}개</span>
                      <span>API {collectionResult.apiCalls}회</span>
                      <span>
                        추정 비용{" "}
                        {formatEstimatedCost(
                          collectionResult.estimatedCostMicros,
                        )}
                      </span>
                    </div>
                  ) : null}
                </div>
                <Button
                  type="button"
                  className="w-full shrink-0 gap-2 rounded-full xl:w-fit"
                  onClick={() => void handleRunXCollectionNow()}
                  disabled={!settings || isSaving || isRunningCollection}
                >
                  {isRunningCollection ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  지금 수집
                </Button>
              </div>
            </CardContent>
          </Card>

          <MemberPostFeedMonitor
            xCollectionEnabled={isXCollectionEnabled}
            naverCafeEnabled={isNaverCafePostsEnabled}
          />

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Coffee className="h-4 w-4 text-muted-foreground" />
                    네이버 카페 최신글
                  </CardTitle>
                  <CardDescription>
                    멤버별 네이버 카페 게시판 최신글 피드의 표시 여부와 공개 범위를 설정합니다.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="w-fit">
                  내부 게시판 목록 API
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <Label
                    htmlFor="naver-cafe-posts-enabled"
                    className="text-sm font-semibold"
                  >
                    카페 최신글 표시
                  </Label>
                  <p className="text-sm leading-6 text-muted-foreground">
                    공개 접근 가능한 네이버 카페 게시판 목록에서 제목, 요약, 작성일,
                    대표 이미지만 가져옵니다.
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

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MessageSquareText className="h-4 w-4 text-muted-foreground" />
                    X 게시글 링크 프리뷰
                  </CardTitle>
                  <CardDescription>
                    X/Twitter 게시글 링크를 X API로 조회해 카드형 미리보기로 표시합니다.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="w-fit">
                  X API 사용
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <Label
                    htmlFor="x-rich-link-preview-enabled"
                    className="text-sm font-semibold"
                  >
                    링크된 X 게시글 내용 표시
                  </Label>
                  <p className="text-sm leading-6 text-muted-foreground">
                    멤버 게시글 안의 X/Twitter 게시글 링크를 추가 API 호출로 조회해
                    작성자, 본문, 미디어를 표시합니다. API 크레딧 사용량이 늘 수
                    있어 필요하면 켤 수 있습니다.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {isRichXLinkPreviewEnabled ? (
                    <Badge variant="default" className="bg-green-600">
                      활성화
                    </Badge>
                  ) : (
                    <Badge variant="secondary">비활성</Badge>
                  )}
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

          <NaverCafeSourceManager />
        </div>
      )}
    </section>
  );
}
