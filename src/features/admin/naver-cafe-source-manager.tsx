import { useCallback, useEffect, useMemo, useState } from "react";
import type { NaverCafeSource } from "@/db/schema";
import type { Member } from "@/lib/types";
import {
  Coffee,
  ExternalLink,
  Loader2,
  Pencil,
  PlusCircle,
  RefreshCw,
  Trash2,
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
import { useToast } from "@/components/ui/toast";
import { fetchActiveMembers } from "@/lib/api/members";
import {
  createNaverCafeSource,
  deleteNaverCafeSource,
  fetchNaverCafeSources,
  updateNaverCafeSource,
} from "@/lib/api/naver-cafe";
import { ConfirmActionDialog } from "./components/confirm-action-dialog";
import { AdminSectionHeader } from "./components/admin-section-header";
import {
  NaverCafeSourceFormDialog,
  type NaverCafeSourceFormValues,
} from "./naver-cafe-source-form-dialog";

const NO_MEMBER_VALUE = "__none__";

const normalizeNaverCafeSourceFormValues = (
  values: NaverCafeSourceFormValues,
) => ({
  id: values.id,
  name: values.name,
  cafe_url: values.cafe_url,
  cafe_id: values.cafe_id,
  menu_id: values.menu_id,
  member_uid:
    values.member_uid && values.member_uid !== NO_MEMBER_VALUE
      ? Number(values.member_uid)
      : null,
  enabled: values.enabled,
  sort_order: values.sort_order,
});

const SOURCE_SORT_OPTIONS = [
  { value: "order_asc", label: "정렬값 오름차순" },
  { value: "name_asc", label: "이름 오름차순" },
  { value: "enabled_first", label: "활성 먼저" },
] as const;

type SourceSortKey = (typeof SOURCE_SORT_OPTIONS)[number]["value"];

export function NaverCafeSourceManager() {
  const { toast } = useToast();
  const [sources, setSources] = useState<NaverCafeSource[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<NaverCafeSource | null>(
    null,
  );
  const [deletingSource, setDeletingSource] = useState<NaverCafeSource | null>(
    null,
  );
  const [sourceSort, setSourceSort] = useState<SourceSortKey>("order_asc");

  const loadData = useCallback(async () => {
    setIsFetching(true);
    try {
      const [sourceData, memberData] = await Promise.all([
        fetchNaverCafeSources(),
        fetchActiveMembers(),
      ]);
      setSources(sourceData);
      setMembers(memberData);
    } catch (error) {
      console.error("Failed to load Naver Cafe sources:", error);
      toast({
        variant: "error",
        description: "네이버 카페 게시판 목록을 불러오지 못했습니다.",
      });
    } finally {
      setIsFetching(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const memberMap = useMemo(
    () => new Map(members.map((member) => [member.uid, member])),
    [members],
  );

  const sortedSources = useMemo(() => {
    const list = [...sources];
    if (sourceSort === "name_asc") {
      return list.sort((a, b) => a.name.localeCompare(b.name));
    }
    if (sourceSort === "enabled_first") {
      return list.sort(
        (a, b) =>
          Number(b.enabled !== false) - Number(a.enabled !== false) ||
          (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
          a.name.localeCompare(b.name),
      );
    }
    return list.sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        a.name.localeCompare(b.name),
    );
  }, [sourceSort, sources]);

  const handleOpenCreate = () => {
    setEditingSource(null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (source: NaverCafeSource) => {
    setEditingSource(source);
    setIsDialogOpen(true);
  };

  const handleSubmit = async (values: NaverCafeSourceFormValues) => {
    setIsSaving(true);
    try {
      const payload = normalizeNaverCafeSourceFormValues(values);
      if (editingSource?.id) {
        await updateNaverCafeSource({ ...payload, id: editingSource.id });
      } else {
        await createNaverCafeSource(payload);
      }

      await loadData();
      setIsDialogOpen(false);
      toast({
        variant: "success",
        description: editingSource?.id
          ? "카페 게시판을 수정했습니다."
          : "카페 게시판을 등록했습니다.",
      });
    } catch (error) {
      console.error("Failed to save Naver Cafe source:", error);
      toast({
        variant: "error",
        description: "카페 게시판 저장에 실패했습니다.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingSource?.id) return;
    try {
      await deleteNaverCafeSource(deletingSource.id);
      await loadData();
      toast({
        variant: "success",
        description: "카페 게시판을 삭제했습니다.",
      });
    } catch (error) {
      console.error("Failed to delete Naver Cafe source:", error);
      toast({
        variant: "error",
        description: "카페 게시판 삭제에 실패했습니다.",
      });
    } finally {
      setDeletingSource(null);
    }
  };

  return (
    <div className="space-y-4">
      <AdminSectionHeader
        title="네이버 카페 게시판"
        description="멤버별 공지 게시판의 최신글 목록을 가져올 소스를 관리합니다."
        count={sortedSources.length}
        actions={
          <>
            <Select
              value={sourceSort}
              onValueChange={(value) => setSourceSort(value as SourceSortKey)}
            >
              <SelectTrigger className="h-8 w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadData()}
              disabled={isFetching}
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <Button onClick={handleOpenCreate} size="sm" className="gap-1.5">
              <PlusCircle className="h-4 w-4" />새 게시판
            </Button>
          </>
        }
      />

      {isFetching && sortedSources.length === 0 ? (
        <div className="flex h-44 items-center justify-center rounded-xl border border-dashed">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      ) : sortedSources.length === 0 ? (
        <div className="flex h-44 items-center justify-center rounded-xl border border-dashed bg-muted/30 text-sm text-muted-foreground">
          등록된 네이버 카페 게시판이 없습니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[70px]">상태</TableHead>
                <TableHead className="w-[180px]">게시판</TableHead>
                <TableHead className="w-[150px]">멤버</TableHead>
                <TableHead className="w-[190px]">ID</TableHead>
                <TableHead>URL</TableHead>
                <TableHead className="w-[80px] text-right">정렬</TableHead>
                <TableHead className="w-[90px] text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedSources.map((source) => {
                const member = source.member_uid
                  ? memberMap.get(source.member_uid)
                  : null;
                return (
                  <TableRow key={source.id}>
                    <TableCell>
                      {source.enabled !== false ? (
                        <Badge className="bg-emerald-600">활성</Badge>
                      ) : (
                        <Badge variant="secondary">비활성</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 font-medium">
                        <Coffee className="h-4 w-4 text-emerald-600" />
                        {source.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {member ? (
                        <span>
                          {member.oshi_mark ? `${member.oshi_mark} ` : ""}
                          {member.name}
                        </span>
                      ) : (
                        "매핑 없음"
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {source.cafe_id} / {source.menu_id}
                    </TableCell>
                    <TableCell>
                      <a
                        href={source.cafe_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-[330px] items-center gap-1 truncate text-xs text-primary hover:underline"
                        title={source.cafe_url}
                      >
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        {source.cafe_url}
                      </a>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {source.sort_order ?? 0}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleOpenEdit(source)}
                          title="수정"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeletingSource(source)}
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

      <NaverCafeSourceFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSubmit={handleSubmit}
        initialValues={editingSource}
        members={members}
        isSaving={isSaving}
      />

      <ConfirmActionDialog
        open={Boolean(deletingSource)}
        onOpenChange={(open) => {
          if (!open) setDeletingSource(null);
        }}
        title="게시판 삭제 확인"
        description="정말로 이 네이버 카페 게시판 소스를 삭제하시겠습니까?"
        confirmLabel="삭제"
        destructive
        onConfirm={() => {
          void handleDelete();
        }}
      />
    </div>
  );
}
