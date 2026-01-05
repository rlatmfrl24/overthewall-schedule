import { useEffect } from "react";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { type DDay } from "@/db/schema";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldError, FieldLabel } from "@/components/ui/field";
import { normalizeDDayColors } from "@/lib/dday";
import { Loader2, Plus, Trash2 } from "lucide-react";

export interface DDayFormValues {
  id?: number;
  title: string;
  date: string;
  description: string;
  colors: string[];
  type: "debut" | "birthday" | "event";
}

interface DDayFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: DDayFormValues) => Promise<void>;
  initialValues?: DDay | null;
  isSaving?: boolean;
}

export function DDayFormDialog({
  open,
  onOpenChange,
  onSubmit,
  initialValues,
  isSaving = false,
}: DDayFormDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<DDayFormValues>({
    defaultValues: {
      title: "",
      date: "",
      description: "",
      colors: ["#f97316"],
      type: "event",
    },
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "colors",
  });
  const colors = watch("colors") || [];

  useEffect(() => {
    if (open) {
      if (initialValues) {
        const parsedColors = normalizeDDayColors(initialValues.color);
        reset({
          id: initialValues.id,
          title: initialValues.title ?? "",
          date: initialValues.date ?? "",
          description: initialValues.description ?? "",
          colors: parsedColors.length ? parsedColors : ["#f97316"],
          type: (initialValues.type as DDayFormValues["type"]) ?? "event",
        });
      } else {
        reset({
          title: "",
          date: "",
          description: "",
          colors: ["#f97316"],
          type: "event",
        });
      }
    }
  }, [open, initialValues, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {initialValues ? "D-Day 수정" : "새 D-Day 등록"}
          </DialogTitle>
          <DialogDescription>
            기념일 또는 이벤트 D-Day 정보를 관리합니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 py-4">
          <div className="space-y-2">
            <FieldLabel htmlFor="title">제목</FieldLabel>
            <Input
              id="title"
              placeholder="예) 데뷔 1주년 / 신곡 발매"
              {...register("title", { required: "제목을 입력해주세요" })}
            />
            <FieldError errors={[errors.title]} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <FieldLabel htmlFor="date">기준 날짜</FieldLabel>
              <Input
                id="date"
                type="date"
                {...register("date", { required: "날짜를 입력해주세요" })}
              />
              <p className="text-xs text-muted-foreground">
                연간 반복 시에도 월/일 정보를 기준으로 사용합니다.
              </p>
              <FieldError errors={[errors.date]} />
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="color-0">포인트 색상</FieldLabel>
              <div className="space-y-2">
                {fields.map((field, index) => {
                  const value = colors?.[index] ?? "";
                  return (
                    <div
                      key={field.id}
                      className="flex items-center gap-2"
                      data-testid={`color-row-${index}`}
                    >
                      <Input
                        id={`color-${index}`}
                        type="color"
                        className="h-10 w-20 p-1"
                        value={value || "#f97316"}
                        onChange={(event) =>
                          setValue(`colors.${index}`, event.target.value, {
                            shouldDirty: true,
                          })
                        }
                      />
                      <Input
                        type="text"
                        placeholder="#f97316"
                        className="flex-1"
                        value={value}
                        onChange={(event) =>
                          setValue(`colors.${index}`, event.target.value, {
                            shouldDirty: true,
                          })
                        }
                      />
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(index)}
                          aria-label="색상 삭제"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() =>
                    append(colors?.[colors.length - 1] ?? "#f97316")
                  }
                >
                  <Plus className="h-4 w-4" />
                  색상 추가
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                여러 색상을 추가하면 순서대로 그라데이션으로 표시됩니다.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      <SelectItem value="debut">데뷔일 (주년 계산)</SelectItem>
                      <SelectItem value="birthday">생일 (매년)</SelectItem>
                      <SelectItem value="event">이벤트 (단발)</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="description">설명 (선택)</FieldLabel>
            <Textarea
              id="description"
              placeholder="추가 설명을 입력하세요"
              className="resize-none min-h-[80px]"
              {...register("description")}
            />
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

