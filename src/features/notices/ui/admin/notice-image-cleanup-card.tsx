import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PiArrowsClockwiseBold, PiHardDriveBold, PiTrashBold } from "react-icons/pi";
import { queryKeys } from "@/shared/query/query-keys";
import { QUERY_STALE_TIME_MS } from "@/shared/query/query-client";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/shared/ui/card";
import { ConfirmActionDialog } from "@/shared/ui/confirm-action-dialog";
import { QueryReadback } from "@/shared/ui/query-readback";
import { useToast } from "@/shared/ui/toast";
import { cleanupUnusedNoticeThumbnails, fetchNoticeThumbnailStatus } from "../../api/notices";

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "0B";
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)}KB`;
  return `${(value / (1024 * 1024)).toFixed(1)}MB`;
};

export function NoticeImageCleanupCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCleaning, setIsCleaning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const statusQuery = useQuery({
    queryKey: queryKeys.notices.thumbnailStatus(),
    queryFn: fetchNoticeThumbnailStatus,
    staleTime: QUERY_STALE_TIME_MS,
  });
  const status = statusQuery.data;
  const stats = status?.stats;
  const preview = status?.objects.filter((asset) => asset.cleanupEligible).slice(0, 3) ?? [];
  const cleanupDisabled = isCleaning || statusQuery.isFetching || statusQuery.isError ||
    !status?.bucketConfigured || !stats?.cleanupEligibleObjects;

  const handleCleanup = async () => {
    if (cleanupDisabled) return;
    setIsCleaning(true);
    try {
      const result = await cleanupUnusedNoticeThumbnails();
      await queryClient.invalidateQueries({ queryKey: queryKeys.notices.thumbnailStatus() });
      toast({
        variant: result.failedCount > 0 ? "info" : "success",
        description: result.failedCount > 0
          ? `미사용 썸네일 ${result.deletedCount}개를 정리했고 ${result.failedCount}개는 실패했습니다.`
          : `미사용 썸네일 ${result.deletedCount}개를 정리했습니다.`,
      });
    } catch (error) {
      console.error("Failed to clean up notice thumbnails:", error);
      toast({ variant: "error", description: "미사용 썸네일 정리에 실패했습니다." });
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <Card role="region" aria-labelledby="notice-image-cleanup-heading">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="notice-image-cleanup-heading" className="flex items-center gap-2 font-semibold">
            <PiHardDriveBold className="size-4" aria-hidden="true" /> 이미지 정리
          </h3>
          {status && <Badge variant="outline">{status.bucketConfigured ? "연결됨" : "미설정"}</Badge>}
        </div>
        <CardDescription>공지 이미지의 저장 상태를 확인하고 미사용 파일을 정리합니다.</CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-3">
        <QueryReadback updatedAt={statusQuery.dataUpdatedAt} fetching={statusQuery.isFetching} error={statusQuery.isError} className="my-0" />
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-y py-2 text-sm">
          {([
            ["전체", stats?.totalObjects],
            ["사용 중", stats?.referencedObjects],
            ["미사용", stats?.unusedObjects],
            ["누락", stats?.missingReferencedObjects],
            ["정리 가능", stats?.cleanupEligibleObjects],
          ] as const).map(([label, count]) => (
            <div key={label} className="flex flex-wrap items-baseline justify-between gap-x-2">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-medium tabular-nums">{count === undefined ? "미확인" : `${count.toLocaleString("ko-KR")}개`}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
          업로드 제한 {status ? formatBytes(status.maxBytes) : "미확인"} · {status?.prefix ?? "notices/thumbnails/"}
        </p>
        {status && !status.bucketConfigured && <p className="text-sm text-destructive">R2 버킷이 설정되지 않아 업로드와 정리를 사용할 수 없습니다.</p>}
        {status && status.missingReferences.length > 0 && (
          <div className="space-y-1 text-xs">
            <p className="font-medium">누락된 공지 썸네일 {status.missingReferences.length}개</p>
            {status.missingReferences.slice(0, 3).map((reference) => (
              <p key={reference.key} className="text-muted-foreground [overflow-wrap:anywhere]">{reference.key} · 참조 {reference.referenceCount}건</p>
            ))}
          </div>
        )}
        {stats && preview.length > 0 && (
          <div className="space-y-1 text-xs">
            <p className="font-medium">정리 대상 {stats.cleanupEligibleObjects}개 · {formatBytes(stats.cleanupEligibleBytes)}</p>
            {preview.map((asset) => (
              <p key={asset.objectKey ?? asset.key} className="text-muted-foreground [overflow-wrap:anywhere]">{asset.key} · {formatBytes(asset.size)}</p>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="min-h-11 md:min-h-8" onClick={() => void statusQuery.refetch()} disabled={statusQuery.isFetching || isCleaning}>
            <PiArrowsClockwiseBold className={statusQuery.isFetching ? "animate-spin" : undefined} aria-hidden="true" /> 상태 점검
          </Button>
          <Button variant="outline" size="sm" className="min-h-11 md:min-h-8" onClick={() => setConfirmOpen(true)} disabled={cleanupDisabled}>
            <PiTrashBold aria-hidden="true" /> {isCleaning ? "정리 중" : "미사용 정리"}
          </Button>
          <a className="inline-flex min-h-11 items-center text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground md:min-h-8" href="/admin/content?tab=notices">공지 관리로 이동</a>
        </div>
      </CardContent>
      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="미사용 썸네일 정리 확인"
        description={
          <div className="space-y-2">
            <p>R2에서 사용 중이지 않은 썸네일 {stats?.cleanupEligibleObjects ?? 0}개 ({formatBytes(stats?.cleanupEligibleBytes ?? 0)})를 삭제합니다.</p>
            <p className="font-medium text-destructive">삭제 후에는 복구할 수 없습니다.</p>
          </div>
        }
        confirmLabel="정리"
        destructive
        isProcessing={isCleaning}
        confirmDisabled={cleanupDisabled}
        onConfirm={() => void handleCleanup()}
      />
    </Card>
  );
}
