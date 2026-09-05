import { useConsoleSearch } from "@/shared/lib/admin-console-search";
import { Input } from "@/shared/ui/input";
import { QueryReadback } from "@/shared/ui/query-readback";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchActiveMembers, type Member } from "@/features/members";
import type { Notice } from "../../model/types";
import {
  Loader2,
  PlusCircle,
  Pencil,
  Trash2,
  RefreshCw,
  HardDrive,
  ImageOff,
  Trash,
  Star,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";

import { NoticeFormDialog, type NoticeFormValues } from "./notice-form-dialog";
import {
  cleanupUnusedNoticeThumbnails,
  createNotice,
  deleteNotice,
  fetchNotices,
  fetchNoticeThumbnailStatus,
  setFeaturedNotice,
  updateNotice,
} from "../../api/notices";
import { queryKeys } from "@/shared/query/query-keys";
import { useToast } from "@/shared/ui/toast";
import { AdminSectionHeader, ConfirmActionDialog } from "@/app/admin";
import { getOwnedNoticeThumbnailKey } from "../../model/notice-thumbnails";
import { QUERY_STALE_TIME_MS } from "@/shared/query/query-client";
import type { NoticeThumbnailStatusResponse } from "../../model/types";
import { invalidateNoticeConsumers } from "../../queries/invalidate-notice-consumers";
import {
  getNoticeImageUrls,
  getNoticeLinks,
  getNoticeRelatedMemberUids,
} from "../../model/notice-content";
import {
  getNoticePublicationStatus,
  type NoticePublicationStatus,
} from "../../model/notice-visibility";

const noticeTypeConfigs = {
  notice: {
    label: "공지사항",
    badgeClass:
      "bg-indigo-100 text-indigo-700 hover:bg-indigo-100/80 border-indigo-200",
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

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "0B";
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)}KB`;
  return `${(value / (1024 * 1024)).toFixed(1)}MB`;
};

const noticePublicationStatusOrder: Record<NoticePublicationStatus, number> = {
  published: 3,
  scheduled: 2,
  expired: 1,
  inactive: 0,
};

const renderNoticePublicationStatus = (notice: Notice) => {
  const status = getNoticePublicationStatus(notice);
  if (status === "published") {
    return <Badge className="bg-emerald-600 text-white">게시중</Badge>;
  }
  if (status === "scheduled") {
    return <Badge variant="outline">게시 예정</Badge>;
  }
  if (status === "expired") {
    return <Badge variant="secondary">게시 종료</Badge>;
  }
  return <Badge variant="secondary">비활성</Badge>;
};

const getRelatedMemberLabel = (
  notice: Notice,
  memberMap: Map<number, Member>,
) => {
  const names = getNoticeRelatedMemberUids(notice).map((uid) => {
    const member = memberMap.get(uid);
    return member
      ? `${member.oshi_mark ? `${member.oshi_mark} ` : ""}${member.name}`
      : `UID ${uid}`;
  });
  return names.length > 0 ? names.join(", ") : "OTW 단독";
};

export function NoticeManager({ view = "content" }: { view?: "content" | "resources" }) {
  const [search, updateSearch] = useConsoleSearch();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [featuringNoticeId, setFeaturingNoticeId] = useState<number | null>(null);
  const [isCleaningThumbnails, setIsCleaningThumbnails] = useState(false);
  const [isCleanupConfirmOpen, setIsCleanupConfirmOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null);
  const [deletingNotice, setDeletingNotice] = useState<Notice | null>(null);
  const [noticeSort, setNoticeSort] = useState<NoticeSortKey>("created_desc");

  const noticesQuery = useQuery<Notice[]>({
    queryKey: queryKeys.notices.admin(),
    queryFn: () => fetchNotices({ includeInactive: true }),
    staleTime: QUERY_STALE_TIME_MS,
  });
  const membersQuery = useQuery<Member[]>({
    queryKey: queryKeys.members.active(),
    queryFn: fetchActiveMembers,
    staleTime: QUERY_STALE_TIME_MS,
  });
  const thumbnailStatusQuery = useQuery<NoticeThumbnailStatusResponse>({
    queryKey: queryKeys.notices.thumbnailStatus(),
    queryFn: fetchNoticeThumbnailStatus,
    staleTime: QUERY_STALE_TIME_MS,
  });
  const notices = useMemo(
    () => noticesQuery.data ?? [],
    [noticesQuery.data],
  );
  const members = useMemo(
    () => membersQuery.data ?? [],
    [membersQuery.data],
  );
  const thumbnailStatus = thumbnailStatusQuery.data ?? null;
  const isFetching = noticesQuery.isFetching;
  const isThumbnailStatusLoading = thumbnailStatusQuery.isFetching;

  useEffect(() => {
    if (!noticesQuery.error) return;
    console.error("Failed to load notices:", noticesQuery.error);
    toast({
      variant: "error",
      description: "공지사항 목록을 불러오지 못했습니다.",
    });
  }, [noticesQuery.error, toast]);

  useEffect(() => {
    if (!membersQuery.error) return;
    console.warn("Failed to load notice publisher members:", membersQuery.error);
  }, [membersQuery.error]);

  useEffect(() => {
    if (!thumbnailStatusQuery.error) return;
    console.error(
      "Failed to load notice thumbnail status:",
      thumbnailStatusQuery.error,
    );
    toast({
      variant: "error",
      description: "썸네일 상태를 점검하지 못했습니다.",
    });
  }, [thumbnailStatusQuery.error, toast]);

  const memberMap = useMemo(
    () => new Map(members.map((member) => [member.uid, member])),
    [members],
  );

  const sortedNotices = useMemo(() => {
    const list = [...notices];
    if (noticeSort === "active_first") {
      return list.sort((a, b) => {
        const aStatus = noticePublicationStatusOrder[
          getNoticePublicationStatus(a)
        ];
        const bStatus = noticePublicationStatusOrder[
          getNoticePublicationStatus(b)
        ];
        if (aStatus !== bStatus) return bStatus - aStatus;
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

  const filteredNotices = sortedNotices.filter((notice) => (!search.q || notice.content.toLocaleLowerCase().includes(search.q.toLocaleLowerCase())) && (!search.state || getNoticePublicationStatus(notice) === search.state));

  const featuredNoticeId = useMemo(
    () =>
      notices.reduce<number | null>((selectedId, notice) => {
        if (
          notice.is_featured === false ||
          !notice.id ||
          getNoticePublicationStatus(notice) !== "published"
        ) {
          return selectedId;
        }
        return selectedId === null || notice.id > selectedId
          ? notice.id
          : selectedId;
      }, null),
    [notices],
  );

  const thumbnailStatusByKey = useMemo(
    () =>
      new Map(
        thumbnailStatus?.objects.map((object) => [object.key, object]) ?? [],
      ),
    [thumbnailStatus],
  );
  const missingThumbnailKeys = useMemo(
    () =>
      new Set(
        thumbnailStatus?.missingReferences.map((reference) => reference.key) ??
          [],
      ),
    [thumbnailStatus],
  );
  const cleanupEligibleThumbnailPreview = useMemo(
    () =>
      thumbnailStatus?.objects.filter((object) => object.cleanupEligible) ?? [],
    [thumbnailStatus],
  );

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
      await invalidateNoticeConsumers(queryClient);
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
        started_at: data.started_at || undefined,
        ended_at: data.ended_at || undefined,
      };

      if (editingNotice?.id) {
        await updateNotice({ ...payload, id: editingNotice.id });
      } else {
        await createNotice(payload);
      }

      await invalidateNoticeConsumers(queryClient);
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
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetFeaturedNotice = async (notice: Notice) => {
    if (!notice.id || notice.id === featuredNoticeId) return;
    setFeaturingNoticeId(notice.id);
    try {
      await setFeaturedNotice(notice.id);
      await invalidateNoticeConsumers(queryClient);
      toast({
        variant: "success",
        description: "최상단 대표 공지를 변경했습니다.",
      });
    } catch (error) {
      console.error("Failed to set featured notice:", error);
      toast({
        variant: "error",
        description: "대표 공지 지정에 실패했습니다.",
      });
    } finally {
      setFeaturingNoticeId(null);
    }
  };

  const handleCleanupThumbnails = async () => {
    setIsCleaningThumbnails(true);
    try {
      const result = await cleanupUnusedNoticeThumbnails();
      await queryClient.invalidateQueries({
        queryKey: queryKeys.notices.thumbnailStatus(),
      });
      toast({
        variant: result.failedCount > 0 ? "info" : "success",
        description:
          result.failedCount > 0
            ? `미사용 썸네일 ${result.deletedCount}개를 정리했고 ${result.failedCount}개는 실패했습니다.`
            : `미사용 썸네일 ${result.deletedCount}개를 정리했습니다.`,
      });
    } catch (error) {
      console.error("Failed to clean up notice thumbnails:", error);
      toast({
        variant: "error",
        description: "미사용 썸네일 정리에 실패했습니다.",
      });
    } finally {
      setIsCleaningThumbnails(false);
    }
  };

  const renderThumbnailBadge = (notice: Notice) => {
    const imageUrls = getNoticeImageUrls(notice);
    if (imageUrls.length === 0) {
      return <Badge variant="outline">없음</Badge>;
    }

    const countLabel = imageUrls.length > 1 ? ` · ${imageUrls.length}장` : "";
    const ownedKeys = Array.from(
      new Set(
        imageUrls
          .map((url) => getOwnedNoticeThumbnailKey(url))
          .filter((key): key is string => Boolean(key)),
      ),
    );
    if (ownedKeys.length === 0) {
      return <Badge variant="secondary">외부{countLabel}</Badge>;
    }

    if (!thumbnailStatus) {
      return <Badge variant="outline">R2{countLabel}</Badge>;
    }

    const missingCount = ownedKeys.filter((key) =>
      missingThumbnailKeys.has(key),
    ).length;
    if (missingCount > 0) {
      return (
        <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-800">
          {imageUrls.length > 1
            ? `누락 ${missingCount}/${imageUrls.length}장`
            : "누락"}
        </Badge>
      );
    }

    const allOwnedImagesReferenced = ownedKeys.every(
      (key) => thumbnailStatusByKey.get(key)?.referenced,
    );
    if (!allOwnedImagesReferenced) {
      return <Badge variant="outline">R2 확인 전{countLabel}</Badge>;
    }

    if (ownedKeys.length < imageUrls.length) {
      return <Badge variant="secondary">혼합{countLabel}</Badge>;
    }

    return (
      <Badge
        variant="outline"
        className="border-emerald-300 bg-emerald-50 text-emerald-800"
      >
        R2 정상{countLabel}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      <AdminSectionHeader
        title={view === "resources" ? "이미지 정리" : "공지사항 관리"}
        description="메인 페이지 상단에 노출될 공지사항과 이벤트를 관리합니다."
        count={noticesQuery.data ? sortedNotices.length : undefined}
        actions={view === "content" &&
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
              aria-label="공지 상태 새로고침"
              onClick={() => void noticesQuery.refetch()}
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

      <QueryReadback updatedAt={view === "resources" ? thumbnailStatusQuery.dataUpdatedAt : noticesQuery.dataUpdatedAt} fetching={isFetching} error={view === "resources" ? thumbnailStatusQuery.isError : noticesQuery.isError}/>
      {view === "content" && <p className="text-sm text-muted-foreground">대표 공지를 선택하면 즉시 반영됩니다.</p>}
      {view === "resources" && (<>
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">R2 썸네일 상태</h3>
              {thumbnailStatus ? (
                <Badge
                  variant="outline"
                  className={
                    thumbnailStatus.bucketConfigured
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                      : "border-rose-300 bg-rose-50 text-rose-800"
                  }
                >
                  {thumbnailStatus.bucketConfigured ? "연결됨" : "미설정"}
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              업로드 제한 {thumbnailStatus ? formatBytes(thumbnailStatus.maxBytes) : "미확인"} ·{" "}
              {thumbnailStatus?.prefix ?? "notices/thumbnails/"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void thumbnailStatusQuery.refetch()}
              disabled={isThumbnailStatusLoading || isCleaningThumbnails}
            >
              {isThumbnailStatusLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              상태 점검
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCleanupConfirmOpen(true)}
              disabled={
                isThumbnailStatusLoading ||
                isCleaningThumbnails ||
                !thumbnailStatus?.bucketConfigured ||
                (thumbnailStatus?.stats.cleanupEligibleObjects ?? 0) === 0
              }
            >
              {isCleaningThumbnails ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash className="h-4 w-4" />
              )}
              미사용 정리
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-md border bg-background px-3 py-2">
            <div className="text-xs text-muted-foreground">전체</div>
            <div className="text-lg font-semibold">
              {thumbnailStatus ? `${thumbnailStatus.stats.totalObjects}개` : "미확인"}
            </div>
          </div>
          <div className="rounded-md border bg-background px-3 py-2">
            <div className="text-xs text-muted-foreground">사용중</div>
            <div className="text-lg font-semibold">
              {thumbnailStatus ? `${thumbnailStatus.stats.referencedObjects}개` : "미확인"}
            </div>
          </div>
          <div className="rounded-md border bg-background px-3 py-2">
            <div className="text-xs text-muted-foreground">미사용</div>
            <div className="text-lg font-semibold">
              {thumbnailStatus ? `${thumbnailStatus.stats.unusedObjects}개` : "미확인"}
            </div>
          </div>
          <div className="rounded-md border bg-background px-3 py-2">
            <div className="text-xs text-muted-foreground">누락</div>
            <div className="text-lg font-semibold">
              {thumbnailStatus ? `${thumbnailStatus.stats.missingReferencedObjects}개` : "미확인"}
            </div>
          </div>
          <div className="rounded-md border bg-background px-3 py-2">
            <div className="text-xs text-muted-foreground">정리 가능</div>
            <div className="text-lg font-semibold">
              {thumbnailStatus ? `${thumbnailStatus.stats.cleanupEligibleObjects}개` : "미확인"}
            </div>
          </div>
        </div>

        {thumbnailStatus && !thumbnailStatus.bucketConfigured ? (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
            R2 버킷이 설정되지 않아 업로드와 정리를 사용할 수 없습니다.
          </div>
        ) : null}

        {thumbnailStatus?.missingReferences.length ? (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <div className="flex items-center gap-2 font-medium">
              <ImageOff className="h-4 w-4" />
              R2 객체가 없는 공지 썸네일 {thumbnailStatus.missingReferences.length}개
            </div>
            <div className="mt-1 space-y-1 text-xs">
              {thumbnailStatus.missingReferences.slice(0, 3).map((reference) => (
                <div key={reference.key} className="truncate">
                  {reference.key} · 참조 {reference.referenceCount}건
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {cleanupEligibleThumbnailPreview.length ? (
          <div className="mt-3 rounded-md border bg-muted/20 px-3 py-2 text-sm">
            <div className="font-medium">
              정리 대상 {cleanupEligibleThumbnailPreview.length}개 ·{" "}
              {formatBytes(thumbnailStatus?.stats.cleanupEligibleBytes ?? 0)}
            </div>
            <div className="mt-1 space-y-1 text-xs text-muted-foreground">
              {cleanupEligibleThumbnailPreview
                .slice(0, 3)
                .map((asset) => (
                  <div key={asset.key} className="truncate">
                    {asset.key} · {formatBytes(asset.size)}
                  </div>
                ))}
            </div>
          </div>
        ) : null}
      </div>

      </>)}

      {view === "content" && <div className="flex flex-wrap gap-2"><Input aria-label="공지 내용 검색" placeholder="공지 내용 검색" className="max-w-sm" value={search.q ?? ""} onChange={(event) => updateSearch({q: event.target.value || undefined})}/><select aria-label="공지 노출 상태" className="rounded border bg-background px-3 py-2" value={search.state ?? ""} onChange={(event) => updateSearch({state: event.target.value || undefined})}><option value="">모든 노출 상태</option><option value="published">노출 중</option><option value="scheduled">예정</option><option value="expired">종료</option><option value="inactive">비활성</option></select></div>}
      {view === "content" && (noticesQuery.isError && !noticesQuery.data ? <p role="alert">공지 목록을 확인할 수 없습니다.</p> : isFetching && sortedNotices.length === 0 ? (
        <div className="flex h-44 items-center justify-center rounded-xl border border-dashed">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      ) : sortedNotices.length === 0 ? (
        <div className="flex h-44 items-center justify-center rounded-xl border border-dashed bg-muted/30 text-sm text-muted-foreground">
          등록된 공지사항이 없습니다.
        </div>
      ) : (
          <div className="min-w-0 divide-y rounded-lg border bg-card">
            {filteredNotices.length === 0 && <p className="p-4 text-sm text-muted-foreground">검색 조건에 맞는 공지사항이 없습니다.</p>}
            {filteredNotices.map((notice) => (
              <article key={notice.id} className="grid min-w-0 items-start gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_14rem_16rem]">
                <div className="min-w-0 space-y-1">
                  <h3 className="whitespace-pre-wrap break-words font-semibold leading-relaxed [overflow-wrap:anywhere]">{notice.content}</h3>
                  <p className="break-words text-xs leading-5 text-muted-foreground">{getRelatedMemberLabel(notice, memberMap)}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1">이미지 {renderThumbnailBadge(notice)}</span><span>링크 {getNoticeLinks(notice).length}개</span></div>
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">{renderNoticePublicationStatus(notice)}<span>{noticeTypeConfigs[notice.type as NoticeTypeKey]?.label ?? notice.type}</span></div>
                  <p className="text-xs leading-5 text-muted-foreground tabular-nums">{formatPeriod(notice)}</p>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-1 lg:w-64">
                  <Button size="sm" variant={notice.id === featuredNoticeId ? "default" : "outline"} aria-pressed={notice.id === featuredNoticeId} disabled={featuringNoticeId !== null || getNoticePublicationStatus(notice) !== "published"} onClick={() => void handleSetFeaturedNotice(notice)}><Star className="size-3.5"/>{notice.id === featuredNoticeId ? "대표 공지" : "대표로 선택"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => handleOpenEdit(notice)} aria-label={`${notice.content} 수정`}><Pencil className="size-3.5"/>수정</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeletingNotice(notice)} aria-label={`${notice.content} 삭제`}><Trash2 className="size-3.5"/>삭제</Button>
                </div>
              </article>
            ))}
          </div>
      ))}

      <NoticeFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSubmit={handleSubmit}
        initialValues={editingNotice}
        members={members}
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

      <ConfirmActionDialog
        open={isCleanupConfirmOpen}
        onOpenChange={setIsCleanupConfirmOpen}
        title="미사용 썸네일 정리 확인"
        description={
          <div className="space-y-2">
            <p>
              R2에서 사용 중이지 않은 썸네일{" "}
              {thumbnailStatus ? `${thumbnailStatus.stats.cleanupEligibleObjects}개` : "미확인"} (
              {formatBytes(thumbnailStatus?.stats.cleanupEligibleBytes ?? 0)})
              를 삭제합니다.
            </p>
            <p className="font-medium text-destructive">
              삭제 후에는 복구할 수 없습니다.
            </p>
          </div>
        }
        confirmLabel="정리"
        destructive
        isProcessing={isCleaningThumbnails}
        onConfirm={() => {
          void handleCleanupThumbnails();
        }}
      />
    </div>
  );
}
