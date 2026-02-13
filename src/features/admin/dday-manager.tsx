import { useCallback, useEffect, useMemo, useState } from "react";
import { type DDay } from "@/db/schema";
import {
  Loader2,
  PlusCircle,
  Pencil,
  Trash2,
  Calendar,
  RefreshCw,
  Flag,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DDayFormDialog, type DDayFormValues } from "./dday-form-dialog";
import { cn } from "@/lib/utils";
import { normalizeDDayColors } from "@/lib/dday";
import {
  createDDay,
  deleteDDay,
  fetchDDays,
  updateDDay,
} from "@/lib/api/ddays";
import { useToast } from "@/components/ui/toast";
import { ConfirmActionDialog } from "./components/confirm-action-dialog";
import { AdminSectionHeader } from "./components/admin-section-header";

const DDAY_TYPE_META = {
  event: {
    label: "이벤트",
    icon: Flag,
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
  },
  birthday: {
    label: "생일",
    icon: Sparkles,
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  debut: {
    label: "데뷔일",
    icon: Sparkles,
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
  },
} as const;

const DDAY_SORT_OPTIONS = [
  { value: "date_asc", label: "날짜 빠른순" },
  { value: "date_desc", label: "날짜 늦은순" },
  { value: "type_then_date", label: "유형별 정렬" },
  { value: "title_asc", label: "제목 오름차순" },
] as const;

type DDaySortKey = (typeof DDAY_SORT_OPTIONS)[number]["value"];

export function DDayManager() {
  const { toast } = useToast();
  const [ddays, setDDays] = useState<DDay[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDDay, setEditingDDay] = useState<DDay | null>(null);
  const [deletingDDay, setDeletingDDay] = useState<DDay | null>(null);
  const [ddaySort, setDDaySort] = useState<DDaySortKey>("date_asc");

  const loadDDays = useCallback(async () => {
    setIsFetching(true);
    try {
      const data = await fetchDDays();
      setDDays(data);
    } catch (error) {
      console.error("Failed to load d-days:", error);
      toast({
        variant: "error",
        description: "D-Day 목록을 불러오지 못했습니다.",
      });
    } finally {
      setIsFetching(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadDDays();
  }, [loadDDays]);

  const sortedDDays = useMemo(() => {
    const list = [...ddays];
    if (ddaySort === "title_asc") {
      return list.sort((a, b) => a.title.localeCompare(b.title));
    }
    if (ddaySort === "type_then_date") {
      return list.sort((a, b) => {
        const typeCompare = (a.type ?? "").localeCompare(b.type ?? "");
        if (typeCompare !== 0) return typeCompare;
        return (a.date ?? "").localeCompare(b.date ?? "");
      });
    }
    return list.sort((a, b) =>
      ddaySort === "date_desc"
        ? (b.date ?? "").localeCompare(a.date ?? "")
        : (a.date ?? "").localeCompare(b.date ?? ""),
    );
  }, [ddays, ddaySort]);

  const handleOpenCreate = () => {
    setEditingDDay(null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (dday: DDay) => {
    setEditingDDay(dday);
    setIsDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingDDay?.id) return;
    try {
      await deleteDDay(deletingDDay.id);
      await loadDDays();
      toast({
        variant: "success",
        description: "D-Day를 삭제했습니다.",
      });
    } catch (error) {
      console.error("Delete failed:", error);
      toast({
        variant: "error",
        description: "D-Day 삭제에 실패했습니다.",
      });
    } finally {
      setDeletingDDay(null);
    }
  };

  const handleSubmit = async (data: DDayFormValues) => {
    setIsSaving(true);
    try {
      const parsedColors = normalizeDDayColors(data.colors);
      const colors = parsedColors.length ? parsedColors : ["#f97316"];
      const payload = {
        title: data.title,
        date: data.date,
        description: data.description || undefined,
        color: colors.join(","),
        type: data.type,
      };

      if (editingDDay?.id) {
        await updateDDay({ ...payload, id: editingDDay.id });
      } else {
        await createDDay(payload);
      }

      await loadDDays();
      setIsDialogOpen(false);
      toast({
        variant: "success",
        description: editingDDay?.id
          ? "D-Day를 수정했습니다."
          : "D-Day를 등록했습니다.",
      });
    } catch (error) {
      console.error("Failed to save d-day:", error);
      toast({
        variant: "error",
        description: "D-Day 저장에 실패했습니다.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <AdminSectionHeader
        title="D-Day 관리"
        description="매년 반복되는 기념일과 이벤트성 D-Day를 등록/수정합니다."
        count={sortedDDays.length}
        actions={
          <>
            <Select
              value={ddaySort}
              onValueChange={(value) => setDDaySort(value as DDaySortKey)}
            >
              <SelectTrigger className="h-8 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DDAY_SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadDDays()}
              disabled={isFetching}
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <Button onClick={handleOpenCreate} size="sm" className="gap-1.5">
              <PlusCircle className="h-4 w-4" />
              새 D-Day
            </Button>
          </>
        }
      />

      {isFetching && sortedDDays.length === 0 ? (
        <div className="flex h-44 items-center justify-center rounded-xl border border-dashed">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      ) : sortedDDays.length === 0 ? (
        <div className="flex h-44 items-center justify-center rounded-xl border border-dashed bg-muted/30 text-sm text-muted-foreground">
          등록된 D-Day가 없습니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">유형</TableHead>
                <TableHead className="w-[90px]">색상</TableHead>
                <TableHead>제목</TableHead>
                <TableHead className="w-[130px]">날짜</TableHead>
                <TableHead>설명</TableHead>
                <TableHead className="w-[90px] text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedDDays.map((dday) => {
                const type = dday.type as keyof typeof DDAY_TYPE_META;
                const meta = DDAY_TYPE_META[type] ?? DDAY_TYPE_META.event;
                const Icon = meta.icon;
                const colors = normalizeDDayColors(
                  (dday as { colors?: string[] }).colors ?? dday.color
                );
                const swatchStyle =
                  colors.length > 1
                    ? { background: `linear-gradient(90deg, ${colors.join(", ")})` }
                    : { backgroundColor: colors[0] ?? "#f59e0b" };

                return (
                  <TableRow key={dday.id}>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "flex w-fit items-center gap-1 border text-xs font-semibold",
                          meta.badgeClass
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className="inline-flex h-5 w-5 rounded-full border shadow-xs"
                        style={swatchStyle}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{dday.title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {dday.date?.replace(/-/g, ".") ?? "-"}
                      </span>
                    </TableCell>
                    <TableCell
                      className="max-w-[320px] truncate text-sm text-muted-foreground"
                      title={dday.description ?? ""}
                    >
                      {dday.description || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleOpenEdit(dday)}
                          title="수정"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeletingDDay(dday)}
                          title="삭제"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <DDayFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSubmit={handleSubmit}
        initialValues={editingDDay}
        isSaving={isSaving}
      />

      <ConfirmActionDialog
        open={Boolean(deletingDDay)}
        onOpenChange={(open) => {
          if (!open) setDeletingDDay(null);
        }}
        title="D-Day 삭제 확인"
        description="정말로 이 D-Day를 삭제하시겠습니까?"
        confirmLabel="삭제"
        destructive
        onConfirm={() => {
          void handleDelete();
        }}
      />
    </div>
  );
}
