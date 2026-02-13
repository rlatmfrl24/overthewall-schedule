import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { type Notice } from "@/db/schema";
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
import { Loader2 } from "lucide-react";

const noticeTypeConfigs = {
  notice: { label: "공지사항" },
  event: { label: "이벤트" },
} as const;

type NoticeTypeKey = keyof typeof noticeTypeConfigs;

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

export interface NoticeFormValues {
  id?: number;
  content: string;
  url: string;
  type: NoticeTypeKey;
  started_at: string;
  ended_at: string;
  is_active: boolean;
}

interface NoticeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: NoticeFormValues) => Promise<void>;
  initialValues?: Notice | null;
  isSaving?: boolean;
}

export function NoticeFormDialog({
  open,
  onOpenChange,
  onSubmit,
  initialValues,
  isSaving = false,
}: NoticeFormDialogProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    getValues,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<NoticeFormValues>({
    defaultValues: {
      content: "",
      url: "",
      type: "notice",
      started_at: "",
      ended_at: "",
      is_active: true,
    },
  });

  useEffect(() => {
    if (open) {
      if (initialValues) {
        reset({
          id: initialValues.id,
          content: initialValues.content ?? "",
          url: initialValues.url ?? "",
          type: (initialValues.type as NoticeTypeKey) ?? "notice",
          started_at: initialValues.started_at ?? "",
          ended_at: initialValues.ended_at ?? "",
          is_active: initialValues.is_active !== false,
        });
      } else {
        reset({
          content: "",
          url: "",
          type: "notice",
          started_at: "",
          ended_at: "",
          is_active: true,
        });
      }
    }
  }, [open, initialValues, reset]);

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
    clearErrors("ended_at");
    await onSubmit(values);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
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

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6 py-4">
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
