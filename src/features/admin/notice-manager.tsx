import { useState, useCallback, useEffect, useMemo } from "react";
import { type Notice } from "@/db/schema";
import {
  Loader2,
  PlusCircle,
  Pencil,
  Trash2,
  ExternalLink,
  Calendar,
  RefreshCw,
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
import { NoticeFormDialog, type NoticeFormValues } from "./notice-form-dialog";
import { cn } from "@/lib/utils";
import {
  createNotice,
  deleteNotice,
  fetchNotices,
  updateNotice,
} from "@/lib/api/notices";
import { useToast } from "@/components/ui/toast";
import { ConfirmActionDialog } from "./components/confirm-action-dialog";
import { AdminSectionHeader } from "./components/admin-section-header";

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

const NOTICE_SORT_OPTIONS = [
  { value: "created_desc", label: "최신 등록순" },
  { value: "created_asc", label: "오래된 등록순" },
  { value: "active_first", label: "활성 우선" },
  { value: "type_then_created", label: "유형별 정렬" },
] as const;

type NoticeSortKey = (typeof NOTICE_SORT_OPTIONS)[number]["value"];

const formatPeriod = (notice: Notice) => {
  if (!notice.started_at && !notice.ended_at) return "기간 설정 없음";
  return `${notice.started_at?.replace(/-/g, ".") ?? "..."} ~ ${
    notice.ended_at?.replace(/-/g, ".") ?? "..."
  }`;
};

export function NoticeManager() {
  const { toast } = useToast();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null);
  const [deletingNotice, setDeletingNotice] = useState<Notice | null>(null);
  const [noticeSort, setNoticeSort] = useState<NoticeSortKey>("created_desc");

  const loadNotices = useCallback(async () => {
    setIsFetching(true);
    try {
      const data = await fetchNotices({ includeInactive: true });
      setNotices(data);
    } catch (error) {
      console.error("Failed to load notices:", error);
      toast({
        variant: "error",
        description: "공지사항 목록을 불러오지 못했습니다.",
      });
    } finally {
      setIsFetching(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadNotices();
  }, [loadNotices]);

  const sortedNotices = useMemo(() => {
    const list = [...notices];
    if (noticeSort === "active_first") {
      return list.sort((a, b) => {
        const aActive = a.is_active !== false ? 1 : 0;
        const bActive = b.is_active !== false ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
      });
    }

    if (noticeSort === "type_then_created") {
      return list.sort((a, b) => {
        const typeCompare = a.type.localeCompare(b.type);
        if (typeCompare !== 0) return typeCompare;
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
      });
    }

    return list.sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return noticeSort === "created_desc" ? bTime - aTime : aTime - bTime;
    });
  }, [notices, noticeSort]);

  const handleOpenCreate = () => {
    setEditingNotice(null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (notice: Notice) => {
    setEditingNotice(notice);
    setIsDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingNotice?.id) return;
    try {
      await deleteNotice(deletingNotice.id);
      await loadNotices();
      toast({
        variant: "success",
        description: "공지사항을 삭제했습니다.",
      });
    } catch (error) {
      console.error("Delete failed:", error);
      toast({
        variant: "error",
        description: "공지사항 삭제에 실패했습니다.",
      });
    } finally {
      setDeletingNotice(null);
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
      toast({
        variant: "success",
        description: editingNotice?.id
          ? "공지사항을 수정했습니다."
          : "공지사항을 등록했습니다.",
      });
    } catch (error) {
      console.error("Failed to save notice:", error);
      toast({
        variant: "error",
        description: "공지사항 저장에 실패했습니다.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <AdminSectionHeader
        title="공지사항 관리"
        description="메인 페이지 상단에 노출될 공지사항과 이벤트를 관리합니다."
        count={sortedNotices.length}
        actions={
          <>
            <Select
              value={noticeSort}
              onValueChange={(value) => setNoticeSort(value as NoticeSortKey)}
            >
              <SelectTrigger className="h-8 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTICE_SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadNotices()}
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
              새 공지
            </Button>
          </>
        }
      />

      {isFetching && sortedNotices.length === 0 ? (
        <div className="flex h-44 items-center justify-center rounded-xl border border-dashed">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      ) : sortedNotices.length === 0 ? (
        <div className="flex h-44 items-center justify-center rounded-xl border border-dashed bg-muted/30 text-sm text-muted-foreground">
          등록된 공지사항이 없습니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[96px]">상태</TableHead>
                <TableHead className="w-[110px]">유형</TableHead>
                <TableHead>내용</TableHead>
                <TableHead className="w-[190px]">기간</TableHead>
                <TableHead className="w-[220px]">링크</TableHead>
                <TableHead className="w-[90px] text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedNotices.map((notice) => (
                <TableRow key={notice.id}>
                  <TableCell>
                    {notice.is_active !== false ? (
                      <Badge className="bg-emerald-600 text-white">게시중</Badge>
                    ) : (
                      <Badge variant="secondary">비활성</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "font-medium border shadow-xs",
                        noticeTypeConfigs[notice.type as NoticeTypeKey]?.badgeClass,
                      )}
                    >
                      {noticeTypeConfigs[notice.type as NoticeTypeKey]?.label ??
                        notice.type}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className="max-w-[420px] truncate text-sm"
                    title={notice.content}
                  >
                    {notice.content}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatPeriod(notice)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {notice.url ? (
                      <a
                        href={notice.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-[200px] items-center gap-1 truncate text-xs text-primary hover:underline"
                        title={notice.url}
                      >
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        {notice.url}
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleOpenEdit(notice)}
                        title="수정"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeletingNotice(notice)}
                        title="삭제"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <NoticeFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSubmit={handleSubmit}
        initialValues={editingNotice}
        isSaving={isSaving}
      />

      <ConfirmActionDialog
        open={Boolean(deletingNotice)}
        onOpenChange={(open) => {
          if (!open) setDeletingNotice(null);
        }}
        title="공지사항 삭제 확인"
        description="정말로 이 공지사항을 삭제하시겠습니까?"
        confirmLabel="삭제"
        destructive
        onConfirm={() => {
          void handleDelete();
        }}
      />
    </div>
  );
}
