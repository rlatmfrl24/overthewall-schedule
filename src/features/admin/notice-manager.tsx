import { useState, useCallback, useEffect } from "react";
import { type Notice } from "@/db/schema";
import {
  Loader2,
  PlusCircle,
  Pencil,
  Trash2,
  ExternalLink,
  Calendar,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { NoticeFormDialog, type NoticeFormValues } from "./notice-form-dialog";
import { cn } from "@/lib/utils";
import {
  createNotice,
  deleteNotice,
  fetchNotices,
  updateNotice,
} from "@/lib/api/notices";

const noticeTypeConfigs = {
  notice: {
    label: "공지사항",
    badgeClass:
      "bg-blue-100 text-blue-700 hover:bg-blue-100/80 border-blue-200",
  },
  event: {
    label: "이벤트",
    badgeClass:
      "bg-purple-100 text-purple-700 hover:bg-purple-100/80 border-purple-200",
  },
} as const;

type NoticeTypeKey = keyof typeof noticeTypeConfigs;

export function NoticeManager() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null);

  const loadNotices = useCallback(async () => {
    setIsFetching(true);
    try {
      const data = await fetchNotices({ includeInactive: true });
      setNotices(data);
    } catch (error) {
      console.error("Failed to load notices:", error);
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    void loadNotices();
  }, [loadNotices]);

  const handleOpenCreate = () => {
    setEditingNotice(null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (notice: Notice) => {
    setEditingNotice(notice);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("정말로 이 공지사항을 삭제하시겠습니까?")) return;
    try {
      await deleteNotice(id);
      await loadNotices();
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  const handleSubmit = async (data: NoticeFormValues) => {
    setIsSaving(true);
    try {
      const payload = {
        ...data,
        is_active: data.is_active,
        url: data.url || undefined,
        started_at: data.started_at || undefined,
        ended_at: data.ended_at || undefined,
      };

      if (editingNotice?.id) {
        await updateNotice({ ...payload, id: editingNotice.id });
      } else {
        await createNotice(payload);
      }

      await loadNotices();
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Failed to save notice:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">공지사항 관리</h2>
          <p className="text-muted-foreground">
            메인 페이지 상단에 노출될 공지사항과 이벤트를 관리합니다.
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="shrink-0 gap-2">
          <PlusCircle className="w-4 h-4" />새 공지 등록
        </Button>
      </div>

      <div className="grid gap-4">
        {isFetching && notices.length === 0 ? (
          <div className="flex items-center justify-center h-64 border rounded-xl border-dashed">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : notices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border rounded-xl border-dashed bg-muted/30 text-muted-foreground gap-2">
            <p>등록된 공지사항이 없습니다.</p>
            <Button variant="outline" size="sm" onClick={handleOpenCreate}>
              첫 공지사항 등록하기
            </Button>
          </div>
        ) : (
          <div className="flex flex-col divide-y rounded-2xl border bg-card">
            {notices.map((notice) => (
              <div
                key={notice.id}
                className={cn(
                  "flex flex-col gap-3 px-4 py-4 transition-colors",
                  notice.is_active === "0"
                    ? "bg-muted/10 text-muted-foreground/90"
                    : "hover:bg-muted/10"
                )}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="secondary"
                      className={cn(
                        "font-medium border shadow-xs h-6",
                        noticeTypeConfigs[notice.type as NoticeTypeKey]
                          ?.badgeClass
                      )}
                    >
                      {noticeTypeConfigs[notice.type as NoticeTypeKey]?.label ??
                        notice.type}
                    </Badge>
                    {notice.is_active !== "0" && (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                        게시중
                      </span>
                    )}
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleOpenEdit(notice)}>
                        <Pencil className="w-4 h-4 mr-2" /> 수정
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => handleDelete(notice.id!)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> 삭제
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <p className="font-medium text-sm leading-relaxed whitespace-pre-wrap wrap-break-word line-clamp-4 text-foreground/90">
                  {notice.content}
                </p>

                <div className="flex flex-wrap items-center gap-3 text-xs">
                  {notice.url ? (
                    <a
                      href={notice.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground hover:text-primary transition-colors rounded-md bg-muted/30 hover:bg-muted group/link"
                    >
                      <ExternalLink className="w-3.5 h-3.5 shrink-0 text-muted-foreground group-hover/link:text-primary transition-colors" />
                      <span className="truncate underline-offset-4 group-hover/link:underline">
                        {notice.url}
                      </span>
                    </a>
                  ) : (
                    <div className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground/50 bg-muted/10 rounded-md select-none">
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      <span>링크 없음</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="w-4 h-4 shrink-0" />
                    <span>
                      {notice.started_at || notice.ended_at
                        ? `${
                            notice.started_at?.replace(/-/g, ".") ?? "..."
                          } ~ ${notice.ended_at?.replace(/-/g, ".") ?? "..."}`
                        : "기간 설정 없음"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <NoticeFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSubmit={handleSubmit}
        initialValues={editingNotice}
        isSaving={isSaving}
      />
    </div>
  );
}
