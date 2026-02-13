import { useEffect, useState } from "react";
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

const YOUTUBE_CHANNEL_ID_REGEX = /^UC[\w-]{22}$/;

const extractChannelIdFromUrl = (url: string): string | null => {
  const value = url.trim();
  if (!value) return null;

  const directMatch = value.match(/\/channel\/(UC[\w-]{22})/i);
  if (directMatch?.[1]) {
    return directMatch[1];
  }

  try {
    const parsed = new URL(value);
    const queryId = parsed.searchParams.get("channel_id");
    if (queryId && YOUTUBE_CHANNEL_ID_REGEX.test(queryId)) {
      return queryId;
    }
  } catch {
    return null;
  }

  return null;
};

const isValidYoutubeUrl = (value: string) => {
  const url = value.trim();
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:"
    ) && parsed.hostname.toLowerCase().includes("youtube.com");
  } catch {
    return false;
  }
};

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
    watch,
    setValue,
    getValues,
    clearErrors,
    setError,
    formState: { errors },
  } = useForm<KirinukiChannelFormValues>({
    defaultValues: {
      channel_name: "",
      channel_url: "",
      youtube_channel_id: "",
    },
  });
  const [autoFilledChannelId, setAutoFilledChannelId] = useState<string | null>(
    null,
  );

  const watchedUrl = watch("channel_url");

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
      setAutoFilledChannelId(null);
    }
  }, [open, initialValues, reset]);

  useEffect(() => {
    if (!open) return;
    const extracted = extractChannelIdFromUrl(watchedUrl || "");
    if (!extracted) return;

    const currentId = getValues("youtube_channel_id")?.trim() ?? "";
    if (currentId === extracted) return;

    if (currentId === "" || currentId === autoFilledChannelId) {
      setValue("youtube_channel_id", extracted, {
        shouldDirty: true,
        shouldValidate: true,
      });
      clearErrors("youtube_channel_id");
      setAutoFilledChannelId(extracted);
    }
  }, [
    autoFilledChannelId,
    clearErrors,
    getValues,
    open,
    setValue,
    watchedUrl,
  ]);

  const handleFormSubmit = async (values: KirinukiChannelFormValues) => {
    const channelUrl = values.channel_url.trim();
    const channelId = values.youtube_channel_id.trim();
    const extracted = extractChannelIdFromUrl(channelUrl);

    const finalChannelId = channelId || extracted || "";
    if (!YOUTUBE_CHANNEL_ID_REGEX.test(finalChannelId)) {
      setError("youtube_channel_id", {
        type: "validate",
        message:
          "YouTube 채널 ID 형식이 올바르지 않습니다. (UC로 시작, 24자)",
      });
      return;
    }

    clearErrors("youtube_channel_id");
    await onSubmit({
      ...values,
      channel_url: channelUrl,
      youtube_channel_id: finalChannelId,
    });
  };

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

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6 py-4">
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
                validate: (value) =>
                  isValidYoutubeUrl(value) ||
                  "YouTube 채널 URL 형식으로 입력해주세요.",
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
                validate: (value) =>
                  YOUTUBE_CHANNEL_ID_REGEX.test(value.trim()) ||
                  "UC로 시작하는 24자 ID를 입력해주세요.",
              })}
            />
            <p className="text-xs text-muted-foreground">
              `/channel/UC...` URL이면 자동으로 ID를 채웁니다.
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
