import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
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

const DDAY_COLOR_PRESETS = [
  "#f97316",
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#a855f7",
  "#14b8a6",
] as const;

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
  const [showAdvancedColors, setShowAdvancedColors] = useState(false);
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
  const colors = watch("colors") || [];
  const addColor = () => {
    const fallback = colors[colors.length - 1] ?? "#f97316";
    setValue("colors", [...colors, fallback], { shouldDirty: true });
  };

  useEffect(() => {
    if (open) {
      if (initialValues) {
        const parsedColors = normalizeDDayColors(initialValues.color);
        setShowAdvancedColors(parsedColors.length > 1);
        reset({
          id: initialValues.id,
          title: initialValues.title ?? "",
          date: initialValues.date ?? "",
          description: initialValues.description ?? "",
          colors: parsedColors.length ? parsedColors : ["#f97316"],
          type: (initialValues.type as DDayFormValues["type"]) ?? "event",
        });
      } else {
        setShowAdvancedColors(false);
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
                <div className="flex flex-wrap items-center gap-2">
                  {DDAY_COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className="h-6 w-6 rounded-full border shadow-xs ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      style={{ backgroundColor: preset }}
                      aria-label={`${preset} 색상 선택`}
                      onClick={() =>
                        setValue("colors", [preset], {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                    />
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    id="color-0"
                    type="color"
                    className="h-10 w-20 p-1"
                    value={colors[0] || "#f97316"}
                    onChange={(event) =>
                      setValue("colors", [event.target.value], {
                        shouldDirty: true,
                      })
                    }
                  />
                  <Input
                    type="text"
                    placeholder="#f97316"
                    className="flex-1"
                    value={colors[0] || ""}
                    onChange={(event) =>
                      setValue("colors", [event.target.value], {
                        shouldDirty: true,
                      })
                    }
                  />
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="px-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowAdvancedColors((prev) => !prev)}
                >
                  {showAdvancedColors ? "고급 색상 접기" : "고급 색상 편집"}
                </Button>

                {showAdvancedColors && (
                  <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                    {colors.map((value, index) => {
                      const currentValue = value ?? "";
                      return (
                        <div
                          key={`${index}-${currentValue}`}
                          className="flex items-center gap-2"
                          data-testid={`color-row-${index}`}
                        >
                          <Input
                            id={`color-${index}`}
                            type="color"
                            className="h-10 w-20 p-1"
                            value={currentValue || "#f97316"}
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
                            value={currentValue}
                            onChange={(event) =>
                              setValue(`colors.${index}`, event.target.value, {
                                shouldDirty: true,
                              })
                            }
                          />
                          {colors.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const nextColors = colors.filter(
                                  (_, idx) => idx !== index
                                );
                                setValue(
                                  "colors",
                                  nextColors.length ? nextColors : ["#f97316"],
                                  { shouldDirty: true }
                                );
                              }}
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
                      onClick={addColor}
                    >
                      <Plus className="h-4 w-4" />
                      색상 추가
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                기본은 단일 색상, 고급 편집에서 다중 색상 그라데이션을 설정할 수 있습니다.
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

          <DialogFooter className="gap-2 pt-2">
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
