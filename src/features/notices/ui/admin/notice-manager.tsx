import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchActiveMembers, type Member } from "@/features/members";
import type { Notice } from "../../model/types";
import {
  Loader2,
  PlusCircle,
  Pencil,
  Trash2,
  ExternalLink,
  Calendar,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { NoticeFormDialog, type NoticeFormValues } from "./notice-form-dialog";
import { cn } from "@/shared/lib/utils";
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

export function NoticeManager() {
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
              업로드 제한 {formatBytes(thumbnailStatus?.maxBytes ?? 0)} ·{" "}
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
              {thumbnailStatus?.stats.totalObjects ?? 0}개
            </div>
          </div>
          <div className="rounded-md border bg-background px-3 py-2">
            <div className="text-xs text-muted-foreground">사용중</div>
            <div className="text-lg font-semibold">
              {thumbnailStatus?.stats.referencedObjects ?? 0}개
            </div>
          </div>
          <div className="rounded-md border bg-background px-3 py-2">
            <div className="text-xs text-muted-foreground">미사용</div>
            <div className="text-lg font-semibold">
              {thumbnailStatus?.stats.unusedObjects ?? 0}개
            </div>
          </div>
          <div className="rounded-md border bg-background px-3 py-2">
            <div className="text-xs text-muted-foreground">누락</div>
            <div className="text-lg font-semibold">
              {thumbnailStatus?.stats.missingReferencedObjects ?? 0}개
            </div>
          </div>
          <div className="rounded-md border bg-background px-3 py-2">
            <div className="text-xs text-muted-foreground">정리 가능</div>
            <div className="text-lg font-semibold">
              {thumbnailStatus?.stats.cleanupEligibleObjects ?? 0}개
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
          <Table className="min-w-[1260px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[96px]">상태</TableHead>
                <TableHead className="w-[130px]">대표 공지</TableHead>
                <TableHead className="w-[110px]">유형</TableHead>
                <TableHead className="w-[180px]">관련 멤버</TableHead>
                <TableHead className="w-[130px]">이미지</TableHead>
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
                    {renderNoticePublicationStatus(notice)}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant={notice.id === featuredNoticeId ? "default" : "outline"}
                      size="sm"
                      className="w-[104px]"
                      disabled={
                        featuringNoticeId !== null ||
                        getNoticePublicationStatus(notice) !== "published"
                      }
                      onClick={() => void handleSetFeaturedNotice(notice)}
                      aria-pressed={notice.id === featuredNoticeId}
                    >
                      {featuringNoticeId === notice.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Star
                          className={cn(
                            "h-3.5 w-3.5",
                            notice.id === featuredNoticeId && "fill-current",
                          )}
                        />
                      )}
                      {notice.id === featuredNoticeId ? "선택됨" : "선택"}
                    </Button>
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
                  <TableCell className="text-sm">
                    <span className="inline-flex max-w-[130px] truncate rounded-md border bg-background px-2 py-1 font-medium text-muted-foreground">
                      <span className="truncate">
                        {getRelatedMemberLabel(notice, memberMap)}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>{renderThumbnailBadge(notice)}</TableCell>
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
                    {getNoticeLinks(notice).length > 0 ? (
                      <a
                        href={getNoticeLinks(notice)[0].url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-[200px] items-center gap-1 truncate text-xs text-primary hover:underline"
                        title={getNoticeLinks(notice)[0].url}
                      >
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        {getNoticeLinks(notice)[0].label}
                        {getNoticeLinks(notice).length > 1
                          ? ` 외 ${getNoticeLinks(notice).length - 1}개`
                          : ""}
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
              {thumbnailStatus?.stats.cleanupEligibleObjects ?? 0}개 (
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
