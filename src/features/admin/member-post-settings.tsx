import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageSquareText, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { AdminSectionHeader } from "./components/admin-section-header";

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
      )}
    </section>
  );
}
