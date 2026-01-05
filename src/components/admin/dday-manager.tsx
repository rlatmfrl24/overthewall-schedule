import { useCallback, useEffect, useMemo, useState } from "react";
import { type DDay } from "@/db/schema";
import {
  Loader2,
  PlusCircle,
  Pencil,
  Trash2,
  Calendar,
  Flag,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DDayFormDialog, type DDayFormValues } from "./dday-form-dialog";
import { cn } from "@/lib/utils";

export function DDayManager() {
  const [ddays, setDDays] = useState<DDay[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDDay, setEditingDDay] = useState<DDay | null>(null);

  const loadDDays = useCallback(async () => {
    setIsFetching(true);
    try {
      const response = await fetch("/api/ddays");
      if (!response.ok) throw new Error("Failed to load d-days");
      const data = await response.json();
      setDDays(data);
    } catch (error) {
      console.error("Failed to load d-days:", error);
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    void loadDDays();
  }, [loadDDays]);

  const handleOpenCreate = () => {
    setEditingDDay(null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (dday: DDay) => {
    setEditingDDay(dday);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("정말로 이 D-Day를 삭제하시겠습니까?")) return;
    try {
      const response = await fetch(`/api/ddays?id=${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete");
      await loadDDays();
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  const handleSubmit = async (data: DDayFormValues) => {
    setIsSaving(true);
    try {
      const payload = {
        ...data,
        description: data.description || undefined,
        color: data.color || undefined,
      };

      const response = await fetch("/api/ddays", {
        method: editingDDay ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingDDay ? { ...payload, id: editingDDay.id } : payload
        ),
      });

      if (!response.ok) throw new Error("Failed to save d-day");

      await loadDDays();
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Failed to save d-day:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const sortedDDays = useMemo(
    () => [...ddays].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")),
    [ddays]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight">D-Day 관리</h2>
          <p className="text-muted-foreground">
            매년 반복되는 기념일과 이벤트성 D-Day를 등록/수정합니다.
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="shrink-0 gap-2">
          <PlusCircle className="w-4 h-4" />새 D-Day 등록
        </Button>
      </div>

      <div className="grid gap-4">
        {isFetching && ddays.length === 0 ? (
          <div className="flex items-center justify-center h-48 border rounded-xl border-dashed">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : ddays.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 border rounded-xl border-dashed bg-muted/30 text-muted-foreground gap-2">
            <p>등록된 D-Day가 없습니다.</p>
            <Button variant="outline" size="sm" onClick={handleOpenCreate}>
              첫 D-Day 등록하기
            </Button>
          </div>
        ) : (
          <div className="flex flex-col divide-y rounded-2xl border bg-card">
            {sortedDDays.map((dday) => {
              const isAnnual =
                dday.type === "debut" || dday.type === "birthday";
              const typeLabel =
                dday.type === "debut"
                  ? "데뷔일"
                  : dday.type === "birthday"
                  ? "생일"
                  : "이벤트";
              return (
                <div
                  key={dday.id}
                  className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-muted/10"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex h-6 w-6 rounded-full border shadow-sm"
                        style={{
                          backgroundColor: dday.color || "#f59e0b",
                          borderColor: dday.color || "#f59e0b",
                        }}
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="text-base font-semibold text-foreground truncate">
                          {dday.title}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          {dday.description || "설명 없음"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={cn(
                          "flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold border",
                          isAnnual
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-blue-50 text-blue-700 border-blue-200"
                        )}
                      >
                        {isAnnual ? (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            {typeLabel}
                          </>
                        ) : (
                          <>
                            <Flag className="w-3.5 h-3.5" />
                            {typeLabel}
                          </>
                        )}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="flex items-center gap-1 text-[11px] font-semibold"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        {dday.date?.replace(/-/g, ".") ?? "-"}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1"
                      onClick={() => handleOpenEdit(dday)}
                    >
                      <Pencil className="w-4 h-4" />
                      수정
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(dday.id!)}
                    >
                      <Trash2 className="w-4 h-4" />
                      삭제
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <DDayFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSubmit={handleSubmit}
        initialValues={editingDDay}
        isSaving={isSaving}
      />
    </div>
  );
}
