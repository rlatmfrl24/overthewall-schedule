import { useCallback, useEffect, useState } from "react";
import {
  EyeOff,
  Globe2,
  Coffee,
  Loader2,
  LockKeyhole,
  MessageSquareText,
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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import {
  fetchSettings,
  updateSettings,
  type AutoUpdateSettings,
} from "@/lib/api/settings";
import { X_POSTS_CONFIG_UPDATED_EVENT } from "@/hooks/use-x-posts-config";
import { NAVER_CAFE_POSTS_CONFIG_UPDATED_EVENT } from "@/hooks/use-naver-cafe-posts-config";
import type { NaverCafePostsVisibility, XPostsVisibility } from "@/lib/types";
import { AdminSectionHeader } from "./components/admin-section-header";
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

export function MemberPostSettingsManager() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<AutoUpdateSettings | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    setIsFetching(true);
    try {
      const data = await fetchSettings();
      setSettings(data);
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
                    있어 필요하면 끌 수 있습니다.
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
