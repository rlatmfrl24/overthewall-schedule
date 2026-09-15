import { useUser } from "@clerk/clerk-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, ListPlus, LoaderCircle, Pencil, Undo2 } from "lucide-react";
import { useRef, useState } from "react";
import type {
  OtwPlayMemberSubmissionStatus,
  OtwPlayParticipantRole,
} from "@contracts/otw-play";
import { useAdminStatus } from "@/features/auth";
import { ApiError } from "@/shared/api/client";
import { queryKeys } from "@/shared/query/query-keys";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/shared/ui/dialog";
import { Switch } from "@/shared/ui/switch";
import { Label } from "@/shared/ui/label";
import {
  useMyOtwPlaySubmission,
  useMyOtwPlaySubmissions,
} from "../../queries/use-member-submissions";
import { withdrawOtwPlaySubmission } from "../../api/submissions";

const labels: Record<OtwPlayMemberSubmissionStatus, string> = {
  pending_review: "검토 대기",
  approved: "승인됨",
  rejected: "반려",
  withdrawn: "철회됨",
};
const roleLabels: Record<OtwPlayParticipantRole, string> = {
  vocal: "메인 보컬",
  featured_vocal: "피처링 보컬",
  chorus: "코러스",
  other: "기타 참여",
};

function BackToPlayLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link to="/play"><ChevronLeft /> OTW Play로 돌아가기</Link>
    </Button>
  );
}

export function OtwPlaySubmissionsPage() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const adminStatusQuery = useAdminStatus(user?.id);
  const isAdmin = adminStatusQuery.data?.isAdmin === true;
  const list = useMyOtwPlaySubmissions();
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const [hideApproved, setHideApproved] = useState(false);
  const visibleItems = hideApproved ? items.filter(item => item.status !== "approved") : items;
  const selectedCardRef = useRef<HTMLButtonElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [commandMessage, setCommandMessage] = useState<string | null>(null);
  const detail = useMyOtwPlaySubmission(selectedId);
  const selectedDetail = detail.data?.id === selectedId ? detail.data : null;
  const withdrawMutation = useMutation({
    mutationFn: ({ id, expectedVersion }: { id: string; expectedVersion: number }) =>
      withdrawOtwPlaySubmission(id, { expectedVersion }),
    onSuccess: async (updated) => {
      setWithdrawOpen(false);
      setCommandMessage("제안을 철회했습니다.");
      queryClient.setQueryData(
        queryKeys.otwPlay.memberSubmission(user?.id ?? "", updated.id),
        updated,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [...queryKeys.otwPlay.all, "member"] }),
        queryClient.invalidateQueries({ queryKey: [...queryKeys.otwPlay.all, "admin", "proposals"] }),
      ]);
    },
    onError: (error) => {
      const apiError = error instanceof ApiError ? error : null;
      setCommandMessage(
        apiError?.code === "PLAY_SUBMISSION_STALE_WRITE"
          ? "제안 상태가 먼저 변경되었습니다. 최신 상태를 다시 불러왔습니다."
          : apiError?.message ?? "제안을 철회하지 못했습니다.",
      );
      void detail.refetch();
    },
  });

  if (list.isPending) {
    return (
      <div className="flex min-h-80 items-center justify-center" aria-busy="true">
        <LoaderCircle className="mr-2 size-5 animate-spin" /> 내 제안을 불러오는 중
      </div>
    );
  }

  if (list.isError && !list.data) {
    return (
      <div className="mx-auto flex min-h-96 w-full max-w-3xl flex-col items-start justify-center gap-4 p-4 sm:p-8">
        <BackToPlayLink />
        <section className="w-full rounded-2xl border border-destructive/30 bg-card p-8 text-center shadow-sm" role="alert">
          <h1 className="text-xl font-bold">내 제안을 불러오지 못했습니다</h1>
          <p className="mt-2 text-sm text-muted-foreground">잠시 후 다시 시도해 주세요.</p>
          <Button className="mt-6" variant="outline" onClick={() => void list.refetch()}>다시 시도</Button>
        </section>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto flex min-h-96 w-full max-w-3xl flex-col items-start justify-center gap-4 p-4 sm:p-8">
        <BackToPlayLink />
        <section className="w-full rounded-2xl border bg-card p-8 text-center shadow-sm">
          <ListPlus className="mx-auto size-10 text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-bold">아직 제출한 제안이 없습니다</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            OTW 멤버가 참여한 공식 커버나 노래 클립을 제안해 주세요.
          </p>
          <Button asChild className="mt-6">
            <Link to="/play/submit" search={{ edit: undefined }}>첫 곡 제안하기</Link>
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-6">
      <BackToPlayLink />
      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold">내 곡 제안</h1>
            <p className="mt-1 text-sm text-muted-foreground">카드를 눌러 상세 정보와 검수 상태를 확인하세요.</p>
          </div>
          <Button asChild size="sm"><Link to="/play/submit" search={{ edit: undefined }}><ListPlus /> 곡 제안하기</Link></Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">불러온 {items.length}개 중 {visibleItems.length}개 표시</p>
          <Label htmlFor="hide-approved-submissions" className="flex min-h-11 cursor-pointer items-center gap-2">
            <Switch id="hide-approved-submissions" checked={hideApproved} onCheckedChange={setHideApproved} /> 승인된 제안 숨기기
          </Label>
        </div>
        <ul className="space-y-3" aria-label="내 곡 제안 목록">
          {visibleItems.map((item) => (
            <li key={item.id}>
              <button type="button" aria-haspopup="dialog" onClick={event => { selectedCardRef.current = event.currentTarget; setCommandMessage(null); setSelectedId(item.id); }} className="flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:gap-4">
                <img src={`https://i.ytimg.com/vi/${item.youtubeVideoId}/hqdefault.jpg`} alt="" loading="lazy" className="aspect-video w-20 shrink-0 rounded-lg object-cover sm:w-28" />
                <span className="min-w-0 flex-1">
                  <span className="mb-1.5 flex flex-wrap items-center gap-2"><Badge variant={item.status === "approved" ? "default" : "secondary"}>{labels[item.status]}</Badge><span className="text-xs text-muted-foreground">{item.submissionKind === "singing_clip" ? "노래 클립" : "공식 커버"}</span></span>
                  <span className="block break-words text-base font-semibold leading-snug sm:text-lg">{item.title}</span>
                  <span className="mt-1 block break-words text-sm">{item.participants.map(participant => participant.displayName).join(", ")}</span>
                  <span className="mt-2 block text-xs text-muted-foreground">제안일 {new Date(item.createdAt).toLocaleDateString("ko-KR")}</span>
                </span>
                <ChevronRight className="hidden size-4 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        {!visibleItems.length ? <div role="status" className="rounded-xl border bg-card p-6 text-center"><p className="font-medium">승인된 제안을 숨겼습니다.</p><p className="mt-2 text-sm text-muted-foreground">{list.hasNextPage ? "불러온 제안은 모두 승인된 상태입니다. 다음 제안을 불러오거나 숨기기를 꺼 주세요." : "표시할 다른 제안이 없습니다. 숨기기를 끄면 승인된 제안을 볼 수 있어요."}</p></div> : null}
        {list.isFetchNextPageError ? <p role="alert" className="text-sm text-destructive">다음 제안을 불러오지 못했습니다. 다시 시도해 주세요.</p> : null}
        {list.hasNextPage ? (
          <Button variant="outline" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>{list.isFetchingNextPage ? "불러오는 중" : list.isFetchNextPageError ? "다음 제안 다시 시도" : "더 보기"}</Button>
        ) : null}
      </section>

      <Dialog open={selectedId !== null} onOpenChange={open => {
        if (!open && !withdrawOpen && !withdrawMutation.isPending) { setSelectedId(null); setCommandMessage(null); }
      }}>
        <DialogContent closeLabel="상세 닫기" className="sm:max-w-xl" onCloseAutoFocus={event => { event.preventDefault(); if (selectedCardRef.current?.isConnected) selectedCardRef.current.focus(); else headingRef.current?.focus(); }}>
          <DialogHeader className="pr-6 text-left">
            <DialogTitle>곡 제안 상세</DialogTitle>
            <DialogDescription>검토 대기 중인 제안은 수정하거나 철회할 수 있습니다.</DialogDescription>
          </DialogHeader>
          {detail.isPending ? <p role="status" className="flex items-center gap-2 py-8 text-sm"><LoaderCircle className="size-4 animate-spin" /> 상세 정보를 불러오는 중</p> : null}
          {detail.isError ? <div role="alert" className="space-y-3 rounded-lg bg-destructive/5 p-4 text-sm"><p>상세 정보를 불러오지 못했습니다.</p><Button variant="outline" size="sm" onClick={() => void detail.refetch()}>상세 다시 시도</Button></div> : null}
        {selectedDetail ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="break-words text-xl font-semibold leading-relaxed">{selectedDetail.title}</h2>
              <Badge>{labels[selectedDetail.status]}</Badge>
            </div>
            <a href={selectedDetail.youtubeUrl} target="_blank" rel="noreferrer" className="block text-sm text-primary underline underline-offset-4">제안한 YouTube 영상 보기</a>
            <dl className="grid grid-cols-1 gap-4 text-base sm:grid-cols-2"><div><dt className="mb-1 text-sm text-muted-foreground">신청 유형</dt><dd>{selectedDetail.submissionKind === "singing_clip" ? "노래 클립" : "공식 커버"}</dd></div>
              <div><dt className="mb-1 text-sm text-muted-foreground">원곡 가수</dt><dd>{selectedDetail.originalArtists.map((item) => item.displayName).join(", ")}</dd></div>
              <div><dt className="mb-1 text-sm text-muted-foreground">참여자</dt><dd>{selectedDetail.participants.map((item) => `${item.displayName} · ${roleLabels[item.participantRole]}`).join(", ")}</dd></div>
              {selectedDetail.submissionKind === "singing_clip" ? <><div><dt className="mb-1 text-sm text-muted-foreground">방송일</dt><dd>{selectedDetail.broadcast?.performedOn ?? "미확인"}</dd></div><div><dt className="mb-1 text-sm text-muted-foreground">완곡 여부</dt><dd>{selectedDetail.broadcast?.extent === "full" ? "완곡" : selectedDetail.broadcast?.extent === "partial" ? "일부 가창" : "미확인"}</dd></div><div className="sm:col-span-2"><dt className="mb-1 text-sm text-muted-foreground">날짜 근거</dt><dd className="whitespace-pre-wrap break-words">{selectedDetail.broadcast?.dateEvidence ?? "미입력"}</dd></div><div className="sm:col-span-2"><dt className="mb-1 text-sm text-muted-foreground">멤버의 원본 다시보기 링크</dt><dd className="break-all">{selectedDetail.broadcast?.originalUrl ? <a href={selectedDetail.broadcast.originalUrl} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">{selectedDetail.broadcast.originalUrl}</a> : "미입력"}</dd></div></> : null}
              {selectedDetail.tags.length > 0 ? <div><dt className="mb-1 text-sm text-muted-foreground">장르(분류)</dt><dd className="flex flex-wrap gap-1.5">{selectedDetail.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</dd></div> : null}
              <div><dt className="mb-1 text-sm text-muted-foreground">제안일</dt><dd className="text-sm">{new Date(selectedDetail.createdAt).toLocaleString("ko-KR")}</dd></div>
              {selectedDetail.note ? <div className="sm:col-span-2"><dt className="mb-1 text-sm text-muted-foreground">내 메모</dt><dd className="whitespace-pre-wrap">{selectedDetail.note}</dd></div> : null}
            </dl>
            {selectedDetail.status === "withdrawn" ? (
              <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                {new Date(selectedDetail.updatedAt).toLocaleString("ko-KR")}에 철회되었습니다.
              </p>
            ) : null}
            {selectedDetail.editable && selectedDetail.withdrawable ? (
              <div className="grid grid-cols-2 gap-2">
                <Button asChild variant="outline">
                  <Link to="/play/submit" search={{ edit: selectedDetail.id }}>
                    <Pencil /> 수정
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCommandMessage(null);
                    setWithdrawOpen(true);
                  }}
                >
                  <Undo2 /> 철회
                </Button>
              </div>
            ) : null}
            {selectedDetail.approvedSong ? (
              selectedDetail.approvedSong.publicLinkAvailable ? (
                <Link
                  to={selectedDetail.approvedSong.releaseType === "broadcast" ? "/play/clips/$songSlug" : "/play/songs/$songSlug"}
                  params={{ songSlug: selectedDetail.approvedSong.slug }}
                  search={{ performance: selectedDetail.approvedSong.performanceId }}
                >
                  <Button className="w-full">승인된 곡 보기</Button>
                </Link>
              ) : (
                <div className="space-y-2 rounded-lg bg-muted p-3 text-sm">
                  <p>승인되어 카탈로그에 반영되었습니다.</p>
                  {isAdmin ? (
                    <Link
                      to={selectedDetail.approvedSong.releaseType === "broadcast" ? "/play/clips/$songSlug" : "/play/songs/$songSlug"}
                      params={{ songSlug: selectedDetail.approvedSong.slug }}
                      search={{ performance: selectedDetail.approvedSong.performanceId }}
                    >
                      <Button variant="outline" size="sm" className="w-full">
                        관리자 미리보기에서 확인
                      </Button>
                    </Link>
                  ) : (
                    <p className="text-muted-foreground">이 제안의 게시 화면은 현재 비공개입니다.</p>
                  )}
                </div>
              )
            ) : null}
          </div>
        ) : null}
        {commandMessage ? (
          <p role="status" className="mt-4 rounded-lg border p-3 text-sm">
            {commandMessage}
          </p>
        ) : null}
        </DialogContent>
      </Dialog>
      <AlertDialog open={withdrawOpen} onOpenChange={open => { if (!withdrawMutation.isPending) setWithdrawOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 제안을 철회할까요?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>철회하면 관리자 검수 목록에서 제거되며 기존 제안은 이력으로 남습니다.</p>
                <p>철회는 취소할 수 없습니다. 다시 제안하려면 새 제안을 제출해야 합니다.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={withdrawMutation.isPending}>계속 검토 대기</AlertDialogCancel>
            <AlertDialogAction
              disabled={withdrawMutation.isPending || !selectedDetail?.withdrawable}
              onClick={(event) => {
                event.preventDefault();
                if (!selectedDetail) return;
                withdrawMutation.mutate({
                  id: selectedDetail.id,
                  expectedVersion: selectedDetail.version,
                });
              }}
            >
              {withdrawMutation.isPending ? "철회 중" : "제안 철회"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
