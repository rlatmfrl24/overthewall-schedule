import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { Member } from "@/lib/types";
import type { NaverCafeSource } from "@/db/schema";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import {
  buildNaverCafeBoardUrl,
  extractNaverCafeBoardIds,
  isValidNaverCafeId,
} from "@/lib/naver-cafe";

const NO_MEMBER_VALUE = "__none__";

export interface NaverCafeSourceFormValues {
  id?: number;
  name: string;
  cafe_url: string;
  cafe_id: string;
  menu_id: string;
  member_uid: string;
  enabled: boolean;
  sort_order: number;
}

interface NaverCafeSourceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: NaverCafeSourceFormValues) => Promise<void>;
  initialValues?: NaverCafeSource | null;
  members: Member[];
  isSaving?: boolean;
}

export function NaverCafeSourceFormDialog({
  open,
  onOpenChange,
  onSubmit,
  initialValues,
  members,
  isSaving = false,
}: NaverCafeSourceFormDialogProps) {
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
  } = useForm<NaverCafeSourceFormValues>({
    defaultValues: {
      name: "",
      cafe_url: "",
      cafe_id: "",
      menu_id: "",
      member_uid: NO_MEMBER_VALUE,
      enabled: true,
      sort_order: 0,
    },
  });
  const [autoFilledIds, setAutoFilledIds] = useState<string | null>(null);

  const watchedUrl = watch("cafe_url");
  const watchedMemberUid = watch("member_uid");
  const watchedEnabled = watch("enabled");

  useEffect(() => {
    if (!open) return;

    if (initialValues) {
      reset({
        id: initialValues.id,
        name: initialValues.name ?? "",
        cafe_url:
          initialValues.cafe_url ||
          buildNaverCafeBoardUrl(initialValues.cafe_id, initialValues.menu_id),
        cafe_id: initialValues.cafe_id ?? "",
        menu_id: initialValues.menu_id ?? "",
        member_uid: initialValues.member_uid
          ? String(initialValues.member_uid)
          : NO_MEMBER_VALUE,
        enabled: initialValues.enabled !== false,
        sort_order: initialValues.sort_order ?? 0,
      });
    } else {
      reset({
        name: "",
        cafe_url: "",
        cafe_id: "",
        menu_id: "",
        member_uid: NO_MEMBER_VALUE,
        enabled: true,
        sort_order: 0,
      });
    }
    setAutoFilledIds(null);
  }, [initialValues, open, reset]);

  useEffect(() => {
    if (!open) return;
    const extracted = extractNaverCafeBoardIds(watchedUrl);
    if (!extracted) return;

    const currentKey = `${getValues("cafe_id")}:${getValues("menu_id")}`;
    const nextKey = `${extracted.cafeId}:${extracted.menuId}`;
    if (currentKey === nextKey) return;

    if (
      currentKey === ":" ||
      currentKey === autoFilledIds ||
      !getValues("cafe_id") ||
      !getValues("menu_id")
    ) {
      setValue("cafe_id", extracted.cafeId, {
        shouldDirty: true,
        shouldValidate: true,
      });
      setValue("menu_id", extracted.menuId, {
        shouldDirty: true,
        shouldValidate: true,
      });
      clearErrors(["cafe_id", "menu_id"]);
      setAutoFilledIds(nextKey);
    }
  }, [autoFilledIds, clearErrors, getValues, open, setValue, watchedUrl]);

  const handleFormSubmit = async (values: NaverCafeSourceFormValues) => {
    const cafeUrl = values.cafe_url.trim();
    const extracted = extractNaverCafeBoardIds(cafeUrl);
    const cafeId = values.cafe_id.trim() || extracted?.cafeId || "";
    const menuId = values.menu_id.trim() || extracted?.menuId || "";

    if (!isValidNaverCafeId(cafeId)) {
      setError("cafe_id", {
        type: "validate",
        message: "카페 ID는 숫자로 입력해주세요.",
      });
      return;
    }
    if (!isValidNaverCafeId(menuId)) {
      setError("menu_id", {
        type: "validate",
        message: "게시판 ID는 숫자로 입력해주세요.",
      });
      return;
    }

    clearErrors(["cafe_id", "menu_id"]);
    await onSubmit({
      ...values,
      name: values.name.trim(),
      cafe_url: cafeUrl || buildNaverCafeBoardUrl(cafeId, menuId),
      cafe_id: cafeId,
      menu_id: menuId,
      sort_order: Number.isFinite(values.sort_order) ? values.sort_order : 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {initialValues ? "카페 게시판 수정" : "새 카페 게시판 등록"}
          </DialogTitle>
          <DialogDescription>
            네이버 카페 게시판 URL을 넣으면 카페 ID와 게시판 ID를 자동으로 채웁니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5 py-4">
          <div className="space-y-2">
            <FieldLabel htmlFor="name">표시 이름</FieldLabel>
            <Input
              id="name"
              placeholder="예: 나츠키"
              {...register("name", {
                required: "표시 이름을 입력해주세요.",
                maxLength: {
                  value: 80,
                  message: "80자 이하로 입력해주세요.",
                },
              })}
            />
            <FieldError errors={[errors.name]} />
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="cafe_url">게시판 URL</FieldLabel>
            <Input
              id="cafe_url"
              placeholder="https://cafe.naver.com/f-e/cafes/31352147/menus/9"
              {...register("cafe_url")}
            />
            <FieldError errors={[errors.cafe_url]} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel htmlFor="cafe_id">카페 ID</FieldLabel>
              <Input
                id="cafe_id"
                inputMode="numeric"
                placeholder="31352147"
                {...register("cafe_id", {
                  required: "카페 ID를 입력해주세요.",
                  validate: (value) =>
                    isValidNaverCafeId(value) || "숫자 ID를 입력해주세요.",
                })}
              />
              <FieldError errors={[errors.cafe_id]} />
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="menu_id">게시판 ID</FieldLabel>
              <Input
                id="menu_id"
                inputMode="numeric"
                placeholder="9"
                {...register("menu_id", {
                  required: "게시판 ID를 입력해주세요.",
                  validate: (value) =>
                    isValidNaverCafeId(value) || "숫자 ID를 입력해주세요.",
                })}
              />
              <FieldError errors={[errors.menu_id]} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <div className="space-y-2">
              <FieldLabel>멤버 매핑</FieldLabel>
              <Select
                value={watchedMemberUid}
                onValueChange={(value) =>
                  setValue("member_uid", value, { shouldDirty: true })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="멤버 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_MEMBER_VALUE}>매핑 없음</SelectItem>
                  {members.map((member) => (
                    <SelectItem key={member.uid} value={String(member.uid)}>
                      {member.oshi_mark ? `${member.oshi_mark} ` : ""}
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="sort_order">정렬</FieldLabel>
              <Input
                id="sort_order"
                type="number"
                min={0}
                max={9999}
                {...register("sort_order", { valueAsNumber: true })}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border bg-muted/20 p-3">
            <FieldLabel htmlFor="enabled">게시판 활성화</FieldLabel>
            <Switch
              id="enabled"
              checked={watchedEnabled}
              onCheckedChange={(value) =>
                setValue("enabled", value, { shouldDirty: true })
              }
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
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {initialValues ? "수정 완료" : "등록하기"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
