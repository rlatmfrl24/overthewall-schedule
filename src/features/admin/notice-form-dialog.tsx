import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
} from "react";
import { useForm, Controller } from "react-hook-form";
import { type Notice } from "@/db/schema";
import type { Member } from "@/lib/types";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError, FieldLabel } from "@/components/ui/field";
import { ImageIcon, Loader2, Upload, X } from "lucide-react";
import {
  deleteNoticeThumbnail,
  uploadNoticeThumbnail,
  type NoticePublisherType,
} from "@/lib/api/notices";
import {
  isAcceptedNoticeThumbnailType,
  NOTICE_THUMBNAIL_ACCEPT,
  NOTICE_THUMBNAIL_MAX_BYTES,
  NOTICE_THUMBNAIL_MAX_LABEL,
} from "@/lib/notice-thumbnails";

const noticeTypeConfigs = {
  notice: { label: "공지사항" },
  event: { label: "이벤트" },
} as const;

type NoticeTypeKey = keyof typeof noticeTypeConfigs;

const NO_PUBLISHER_MEMBER_VALUE = "__none__";

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const isValidHttpUrl = (value: string) => {
  const url = value.trim();
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const isValidImageResourceUrl = (value: string) => {
  const url = value.trim();
  if (!url || url.startsWith("/")) return true;
  return isValidHttpUrl(url);
};

export interface NoticeFormValues {
  id?: number;
  content: string;
  url: string;
  thumbnail_url: string;
  type: NoticeTypeKey;
  publisher_type: NoticePublisherType;
  publisher_member_uid: string;
  started_at: string;
  ended_at: string;
  is_active: boolean;
}

interface NoticeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: NoticeFormValues) => Promise<void>;
  initialValues?: Notice | null;
  members: Member[];
  isSaving?: boolean;
}

export function NoticeFormDialog({
  open,
  onOpenChange,
  onSubmit,
  initialValues,
  members,
  isSaving = false,
}: NoticeFormDialogProps) {
  const thumbnailInputRef = useRef<HTMLInputElement | null>(null);
  const pendingThumbnailUrlsRef = useRef<Set<string>>(new Set());
  const [isUploadingThumbnail, setIsUploadingThumbnail] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    getValues,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<NoticeFormValues>({
    defaultValues: {
      content: "",
      url: "",
      thumbnail_url: "",
      type: "notice",
      publisher_type: "otw",
      publisher_member_uid: NO_PUBLISHER_MEMBER_VALUE,
      started_at: "",
      ended_at: "",
      is_active: true,
    },
  });
  const watchedPublisherType = watch("publisher_type");
  const watchedPublisherMemberUid = watch("publisher_member_uid");
  const watchedThumbnailUrl = watch("thumbnail_url").trim();

  const cleanupNoticeThumbnail = (thumbnailUrl: string) => {
    void deleteNoticeThumbnail(thumbnailUrl).catch((error) => {
      console.warn("Failed to clean up unused notice thumbnail:", error);
    });
  };

  const cleanupPendingThumbnail = (thumbnailUrl?: string | null) => {
    const normalized = thumbnailUrl?.trim();
    if (!normalized || !pendingThumbnailUrlsRef.current.delete(normalized)) {
      return;
    }
    cleanupNoticeThumbnail(normalized);
  };

  const cleanupUnusedPendingThumbnails = (preservedUrl?: string | null) => {
    const preserved = preservedUrl?.trim() ?? "";
    for (const thumbnailUrl of Array.from(pendingThumbnailUrlsRef.current)) {
      if (thumbnailUrl === preserved) continue;
      cleanupPendingThumbnail(thumbnailUrl);
    }
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      if (isSaving || isUploadingThumbnail) return;
      cleanupUnusedPendingThumbnails();
    }
    onOpenChange(nextOpen);
  };

  useEffect(() => {
    if (open) {
      pendingThumbnailUrlsRef.current.clear();
      if (initialValues) {
        reset({
          id: initialValues.id,
          content: initialValues.content ?? "",
          url: initialValues.url ?? "",
          thumbnail_url: initialValues.thumbnail_url ?? "",
          type: (initialValues.type as NoticeTypeKey) ?? "notice",
          publisher_type:
            initialValues.publisher_type === "member" ? "member" : "otw",
          publisher_member_uid: initialValues.publisher_member_uid
            ? String(initialValues.publisher_member_uid)
            : NO_PUBLISHER_MEMBER_VALUE,
          started_at: initialValues.started_at ?? "",
          ended_at: initialValues.ended_at ?? "",
          is_active: initialValues.is_active !== false,
        });
      } else {
        reset({
          content: "",
          url: "",
          thumbnail_url: "",
          type: "notice",
          publisher_type: "otw",
          publisher_member_uid: NO_PUBLISHER_MEMBER_VALUE,
          started_at: "",
          ended_at: "",
          is_active: true,
        });
      }
    }
  }, [open, initialValues, reset]);

  const clearThumbnail = () => {
    cleanupPendingThumbnail(getValues("thumbnail_url"));
    setValue("thumbnail_url", "", { shouldDirty: true, shouldValidate: true });
    clearErrors("thumbnail_url");
    if (thumbnailInputRef.current) {
      thumbnailInputRef.current.value = "";
    }
  };

  const uploadThumbnailFile = async (file: File) => {
    if (!isAcceptedNoticeThumbnailType(file.type)) {
      setError("thumbnail_url", {
        type: "validate",
        message: "webp, png, jpg 이미지만 업로드할 수 있습니다.",
      });
      return;
    }

    if (file.size > NOTICE_THUMBNAIL_MAX_BYTES) {
      setError("thumbnail_url", {
        type: "validate",
        message: `${NOTICE_THUMBNAIL_MAX_LABEL} 이하 이미지만 업로드할 수 있습니다.`,
      });
      return;
    }

    setIsUploadingThumbnail(true);
    clearErrors("thumbnail_url");
    try {
      const previousThumbnailUrl = getValues("thumbnail_url").trim();
      const result = await uploadNoticeThumbnail(file);
      const uploadedThumbnailUrl = result.thumbnail_url.trim();
      pendingThumbnailUrlsRef.current.add(uploadedThumbnailUrl);
      setValue("thumbnail_url", result.thumbnail_url, {
        shouldDirty: true,
        shouldValidate: true,
      });
      if (previousThumbnailUrl !== uploadedThumbnailUrl) {
        cleanupPendingThumbnail(previousThumbnailUrl);
      }
    } catch (error) {
      console.error("Failed to upload notice thumbnail:", error);
      setError("thumbnail_url", {
        type: "validate",
        message: "이미지 업로드에 실패했습니다.",
      });
    } finally {
      setIsUploadingThumbnail(false);
    }
  };

  const handleThumbnailFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      await uploadThumbnailFile(file);
    }
    event.target.value = "";
  };

  const getClipboardImageFile = (clipboardData: DataTransfer) => {
    const fileFromList = Array.from(clipboardData.files).find((file) =>
      file.type.startsWith("image/"),
    );
    if (fileFromList) return fileFromList;

    const imageItem = Array.from(clipboardData.items).find(
      (item) => item.kind === "file" && item.type.startsWith("image/"),
    );
    return imageItem?.getAsFile() ?? null;
  };

  const handleThumbnailPaste = (event: ClipboardEvent<HTMLFormElement>) => {
    const file = getClipboardImageFile(event.clipboardData);
    if (!file) return;

    event.preventDefault();
    if (isUploadingThumbnail || isSaving) return;
    void uploadThumbnailFile(file);
  };

  const handleFormSubmit = async (values: NoticeFormValues) => {
    if (
      values.started_at &&
      values.ended_at &&
      values.started_at > values.ended_at
    ) {
      setError("ended_at", {
        type: "validate",
        message: "종료일은 시작일과 같거나 이후여야 합니다.",
      });
      return;
    }
    if (
      values.publisher_type === "member" &&
      (!values.publisher_member_uid ||
        values.publisher_member_uid === NO_PUBLISHER_MEMBER_VALUE)
    ) {
      setError("publisher_member_uid", {
        type: "validate",
        message: "게시자로 표시할 멤버를 선택해주세요.",
      });
      return;
    }
    clearErrors("ended_at");
    clearErrors("publisher_member_uid");
    await onSubmit(values);
    const savedThumbnailUrl = values.thumbnail_url.trim();
    if (savedThumbnailUrl) {
      pendingThumbnailUrlsRef.current.delete(savedThumbnailUrl);
    }
    cleanupUnusedPendingThumbnails();
  };

  const applyPeriodPreset = (days: number) => {
    const today = new Date();
    const startedAt = formatDateInput(today);
    const endedAt = formatDateInput(addDays(today, Math.max(days - 1, 0)));
    setValue("started_at", startedAt, { shouldDirty: true });
    setValue("ended_at", endedAt, { shouldDirty: true, shouldValidate: true });
    clearErrors("ended_at");
  };

  const resetPeriod = () => {
    setValue("started_at", "", { shouldDirty: true });
    setValue("ended_at", "", { shouldDirty: true });
    clearErrors("ended_at");
  };

  const thumbnailUrlField = register("thumbnail_url", {
    validate: (value) =>
      isValidImageResourceUrl(value) ||
      "http(s) URL 또는 / 로 시작하는 내부 경로를 입력해주세요.",
  });

  const handleThumbnailUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    const previousThumbnailUrl = getValues("thumbnail_url").trim();
    void thumbnailUrlField.onChange(event);
    const nextThumbnailUrl = event.target.value.trim();
    if (previousThumbnailUrl !== nextThumbnailUrl) {
      cleanupPendingThumbnail(previousThumbnailUrl);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {initialValues ? "공지사항 수정" : "새 공지사항 등록"}
          </DialogTitle>
          <DialogDescription>
            {initialValues
              ? "기존 공지사항의 내용을 수정합니다."
              : "새로운 공지사항을 시스템에 등록합니다."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          onPaste={handleThumbnailPaste}
          className="space-y-6 py-4"
        >
          <div className="space-y-2">
            <FieldLabel htmlFor="content">내용</FieldLabel>
            <Textarea
              id="content"
              placeholder="공지 내용을 입력하세요"
              className="resize-none min-h-[100px]"
              {...register("content", { required: "내용을 입력해주세요" })}
            />
            <FieldError errors={[errors.content]} />
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="url">링크 URL (선택)</FieldLabel>
            <Input
              id="url"
              placeholder="https://..."
              {...register("url", {
                validate: (value) =>
                  isValidHttpUrl(value) || "http(s) 형식의 URL을 입력해주세요.",
              })}
            />
            <FieldError errors={[errors.url]} />
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="thumbnail_url">썸네일 이미지</FieldLabel>
            <div
              className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[132px_minmax(0,1fr)]"
              title="클립보드 이미지 붙여넣기"
            >
              <div className="relative aspect-[4/3] overflow-hidden rounded-md border bg-background">
                {watchedThumbnailUrl ? (
                  <img
                    src={watchedThumbnailUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-8 w-8" />
                  </div>
                )}
              </div>

              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={thumbnailInputRef}
                    type="file"
                    accept={NOTICE_THUMBNAIL_ACCEPT}
                    className="sr-only"
                    onChange={(event) => void handleThumbnailFileChange(event)}
                    disabled={isUploadingThumbnail || isSaving}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => thumbnailInputRef.current?.click()}
                    disabled={isUploadingThumbnail || isSaving}
                  >
                    {isUploadingThumbnail ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    이미지 업로드
                  </Button>
                  {watchedThumbnailUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearThumbnail}
                      disabled={isUploadingThumbnail || isSaving}
                    >
                      <X className="h-4 w-4" />
                      제거
                    </Button>
                  ) : null}
                </div>

                <Input
                  id="thumbnail_url"
                  placeholder="https://..."
                  {...thumbnailUrlField}
                  onChange={handleThumbnailUrlChange}
                />
              </div>
            </div>
            <FieldError errors={[errors.thumbnail_url]} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
            <div className="space-y-2">
              <FieldLabel htmlFor="type">유형</FieldLabel>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger id="type" className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(noticeTypeConfigs).map(
                        ([key, config]) => (
                          <SelectItem key={key} value={key}>
                            {config.label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="flex items-end pb-1">
              <div
                className="flex w-full items-center space-x-2 border rounded-md p-2 px-3 bg-muted/20 hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={(e) => {
                  // Prevent double toggle if clicking directly on checkbox or label
                  if (
                    (e.target as HTMLElement).getAttribute("role") ===
                      "checkbox" ||
                    (e.target as HTMLElement).tagName === "LABEL"
                  ) {
                    return;
                  }
                  setValue("is_active", !getValues("is_active"));
                }}
              >
                <Controller
                  name="is_active"
                  control={control}
                  render={({ field }) => (
                    <Checkbox
                      id="is_active"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
                <label
                  htmlFor="is_active"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1 py-1"
                >
                  메인 배너에 노출
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[140px_minmax(0,1fr)]">
            <div className="space-y-2">
              <FieldLabel htmlFor="publisher_type">게시자</FieldLabel>
              <Controller
                name="publisher_type"
                control={control}
                render={({ field }) => (
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value);
                      if (value === "otw") {
                        clearErrors("publisher_member_uid");
                      }
                    }}
                    value={field.value}
                  >
                    <SelectTrigger id="publisher_type" className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="otw">OTW</SelectItem>
                      <SelectItem value="member">멤버</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <FieldLabel htmlFor="publisher_member_uid">멤버 선택</FieldLabel>
              <Select
                value={watchedPublisherMemberUid}
                disabled={watchedPublisherType !== "member"}
                onValueChange={(value) => {
                  setValue("publisher_member_uid", value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                  clearErrors("publisher_member_uid");
                }}
              >
                <SelectTrigger
                  id="publisher_member_uid"
                  className="bg-background disabled:opacity-60"
                >
                  <SelectValue placeholder="멤버 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PUBLISHER_MEMBER_VALUE}>
                    멤버 선택
                  </SelectItem>
                  {members.map((member) => (
                    <SelectItem key={member.uid} value={String(member.uid)}>
                      {member.oshi_mark ? `${member.oshi_mark} ` : ""}
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[errors.publisher_member_uid]} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pb-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyPeriodPreset(1)}
            >
              오늘
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyPeriodPreset(7)}
            >
              7일
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyPeriodPreset(30)}
            >
              30일
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetPeriod}
            >
              기간 초기화
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
            <div className="space-y-2">
              <FieldLabel htmlFor="started_at">시작일</FieldLabel>
              <Input type="date" id="started_at" {...register("started_at")} />
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="ended_at">종료일</FieldLabel>
              <Input type="date" id="ended_at" {...register("ended_at")} />
              <FieldError errors={[errors.ended_at]} />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleDialogOpenChange(false)}
              disabled={isSaving || isUploadingThumbnail}
            >
              취소
            </Button>
            <Button type="submit" disabled={isSaving || isUploadingThumbnail}>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {initialValues ? "수정 완료" : "등록하기"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
