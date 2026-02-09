import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { type KirinukiChannel } from "@/db/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError, FieldLabel } from "@/components/ui/field";
import { Loader2 } from "lucide-react";

export interface KirinukiChannelFormValues {
  id?: number;
  channel_name: string;
  channel_url: string;
  youtube_channel_id: string;
}

interface KirinukiChannelFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: KirinukiChannelFormValues) => Promise<void>;
  initialValues?: KirinukiChannel | null;
  isSaving?: boolean;
}

export function KirinukiChannelFormDialog({
  open,
  onOpenChange,
  onSubmit,
  initialValues,
  isSaving = false,
}: KirinukiChannelFormDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<KirinukiChannelFormValues>({
    defaultValues: {
      channel_name: "",
      channel_url: "",
      youtube_channel_id: "",
    },
  });

  useEffect(() => {
    if (open) {
      if (initialValues) {
        reset({
          id: initialValues.id,
          channel_name: initialValues.channel_name ?? "",
          channel_url: initialValues.channel_url ?? "",
          youtube_channel_id: initialValues.youtube_channel_id ?? "",
        });
      } else {
        reset({
          channel_name: "",
          channel_url: "",
          youtube_channel_id: "",
        });
      }
    }
  }, [open, initialValues, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {initialValues ? "키리누키 채널 수정" : "새 키리누키 채널 등록"}
          </DialogTitle>
          <DialogDescription>
            {initialValues
              ? "기존 채널 정보를 수정합니다."
              : "VOD 페이지의 키리누키 섹션에 표시될 유튜브 채널을 등록합니다."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 py-4">
          <div className="space-y-2">
            <FieldLabel htmlFor="channel_name">채널명</FieldLabel>
            <Input
              id="channel_name"
              placeholder="예: 오버더월 키리누키"
              {...register("channel_name", {
                required: "채널명을 입력해주세요",
              })}
            />
            <FieldError errors={[errors.channel_name]} />
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="channel_url">채널 URL</FieldLabel>
            <Input
              id="channel_url"
              placeholder="https://www.youtube.com/@channel"
              {...register("channel_url", {
                required: "채널 URL을 입력해주세요",
              })}
            />
            <FieldError errors={[errors.channel_url]} />
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="youtube_channel_id">
              YouTube 채널 ID
            </FieldLabel>
            <Input
              id="youtube_channel_id"
              placeholder="UCxxxxxxxxxxxxxxxxxxxxxxxx"
              {...register("youtube_channel_id", {
                required: "YouTube 채널 ID를 입력해주세요",
              })}
            />
            <p className="text-xs text-muted-foreground">
              채널 페이지 소스에서 UCxxxxxxxxxx 형태의 ID를 찾을 수 있습니다.
            </p>
            <FieldError errors={[errors.youtube_channel_id]} />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              취소
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {initialValues ? "수정 완료" : "등록하기"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
