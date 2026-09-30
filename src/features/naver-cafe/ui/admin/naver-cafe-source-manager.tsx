import { SecondaryAction } from "@/shared/ui/secondary-action";
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NaverCafeSourceDto as NaverCafeSource } from "@contracts/naver-cafe";
import { PiArrowSquareOutBold as ExternalLink, PiSpinnerGapBold as Loader2, PiPencilSimpleBold as Pencil, PiPlusCircleBold as PlusCircle, PiArrowsClockwiseBold as RefreshCw, PiTrashBold as Trash2 } from "react-icons/pi";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { QueryReadback } from "@/shared/ui/query-readback";
import { Skeleton } from "@/shared/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { useToast } from "@/shared/ui/toast";
import { fetchActiveMembers } from "@/features/members";
import {
  createNaverCafeSource,
  deleteNaverCafeSource,
  fetchNaverCafeSources,
  updateNaverCafeSource,
} from "../../api/naver-cafe-api";
import { ConfirmActionDialog } from "@/shared/ui/confirm-action-dialog";
import { queryKeys } from "@/shared/query/query-keys";
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
const EMPTY_SOURCES: NaverCafeSource[] = [];
const EMPTY_MEMBERS: Awaited<ReturnType<typeof fetchActiveMembers>> = [];
const NAVER_CAFE_SOURCES_QUERY_KEY = [
  ...queryKeys.memberPosts.all,
  "naver-cafe-sources",
] as const;

export function NaverCafeSourceManager() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<NaverCafeSource | null>(
    null,
  );
  const [deletingSource, setDeletingSource] = useState<NaverCafeSource | null>(
    null,
  );
  const [sourceSort, setSourceSort] = useState<SourceSortKey>("order_asc");
  const sourcesQuery = useQuery({
    queryKey: NAVER_CAFE_SOURCES_QUERY_KEY,
    queryFn: fetchNaverCafeSources,
  });
  const membersQuery = useQuery({
    queryKey: queryKeys.members.active(),
    queryFn: fetchActiveMembers,
  });
  const saveSourceMutation = useMutation({
    mutationFn: async ({
      sourceId,
      values,
    }: {
      sourceId: number | null;
      values: NaverCafeSourceFormValues;
    }) => {
      const payload = normalizeNaverCafeSourceFormValues(values);
      if (sourceId) {
        await updateNaverCafeSource({ ...payload, id: sourceId });
        return;
      }
      await createNaverCafeSource(payload);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: NAVER_CAFE_SOURCES_QUERY_KEY }),
  });
  const deleteSourceMutation = useMutation({
    mutationFn: deleteNaverCafeSource,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: NAVER_CAFE_SOURCES_QUERY_KEY }),
  });
  const sources = sourcesQuery.data ?? EMPTY_SOURCES;
  const members = membersQuery.data ?? EMPTY_MEMBERS;
  const isFetching = sourcesQuery.isFetching || membersQuery.isFetching;
  const isSaving = saveSourceMutation.isPending;

  const loadData = useCallback(async () => {
    try {
      await Promise.all([
        sourcesQuery.refetch(),
        membersQuery.refetch(),
      ]);
    } catch (error) {
      console.error("Failed to load Naver Cafe sources:", error);
      toast({
        variant: "error",
        description: "네이버 카페 게시판 목록을 불러오지 못했습니다.",
      });
    }
  }, [membersQuery, sourcesQuery, toast]);

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
    try {
      await saveSourceMutation.mutateAsync({
        sourceId: editingSource?.id ?? null,
        values,
      });
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
    }
  };

  const handleDelete = async () => {
    if (!deletingSource?.id) return;
    try {
      await deleteSourceMutation.mutateAsync(deletingSource.id);
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
    <section className="min-w-0 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">네이버 카페 게시판</h4>
            {sourcesQuery.data && <Badge variant="outline">{sortedSources.length}개</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
            <Select
              value={sourceSort}
              onValueChange={(value) => setSourceSort(value as SourceSortKey)}
            >
              <SelectTrigger size="sm" className="w-auto" aria-label="카페 게시판 정렬">
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
              aria-label="카페 게시판 목록 새로고침"
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
        </div>
      </div>

      <QueryReadback updatedAt={sourcesQuery.dataUpdatedAt} fetching={sourcesQuery.isFetching} error={sourcesQuery.isError} />
      {sourcesQuery.isError && !sourcesQuery.data ? <p className="text-sm text-destructive">게시판 목록 조회 실패 · 새로고침으로 다시 확인해 주세요.</p> : isFetching && sortedSources.length === 0 ? (
        <div role="status" aria-label="게시판 목록 확인 중" className="space-y-2">{[1, 2, 3].map((row) => <Skeleton key={row} className="h-11 w-full" />)}</div>
      ) : sortedSources.length === 0 ? (
        <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
          등록된 네이버 카페 게시판이 없습니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table className="min-w-[560px] text-[13px]">
            <TableHeader>
              <TableRow>
                <TableHead className="px-3">게시판 / ID</TableHead>
                <TableHead>멤버</TableHead>
                <TableHead>활성</TableHead>
                <TableHead className="text-right">정렬</TableHead>
                <TableHead className="text-right pr-3">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedSources.map((source) => {
                const member = source.member_uid
                  ? memberMap.get(source.member_uid)
                  : null;
                return (
                  <TableRow key={source.id}>
                    <TableCell className="px-3 whitespace-normal">
                      <a href={source.cafe_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                        {source.name}<ExternalLink className="size-3 shrink-0" /><span className="sr-only">카페 새 탭에서 열기</span>
                      </a>
                      <p className="mt-0.5 text-xs text-muted-foreground">카페 {source.cafe_id} / 게시판 {source.menu_id}</p>
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
                    <TableCell>
                      <Badge variant={source.enabled !== false ? "outline" : "secondary"}>{source.enabled !== false ? "활성" : "비활성"}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {source.sort_order ?? 0}
                    </TableCell>
                    <TableCell className="text-right pr-3">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleOpenEdit(source)}
                          title="수정"
                          aria-label={`${source.name} 수정`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <SecondaryAction
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeletingSource(source)}
                          title="삭제"
                          aria-label={`${source.name} 삭제`}
                          disabled={deleteSourceMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </SecondaryAction>
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
        description={`${deletingSource?.name ?? ""} 게시판 소스를 삭제하시겠습니까?`}
        confirmLabel="삭제"
        destructive
        isProcessing={deleteSourceMutation.isPending}
        onConfirm={() => {
          void handleDelete();
        }}
      />
    </section>
  );
}
