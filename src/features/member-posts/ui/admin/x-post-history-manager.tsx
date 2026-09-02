import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, RefreshCw, ShieldX } from "lucide-react";
import type { XHistoryPostDto, XHistoryPostStatus } from "@contracts/x-posts";
import { fetchActiveMembers } from "@/features/members";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { useToast } from "@/shared/ui/toast";
import { fetchXHistoryPosts, redactXHistoryPost } from "../../api/x-history-api";

type StatusFilter = "all" | XHistoryPostStatus;

const formatDate = (value: number) => new Date(value).toLocaleString("ko-KR");

const postKindLabel: Record<XHistoryPostDto["postType"], string> = {
  post: "게시물",
  reply: "답글",
  quote: "인용",
};

const getReferencedPost = (item: XHistoryPostDto) => {
  if (!item.post) return null;
  if (item.post.reply) return { kind: "답글 대상", ...item.post.reply };
  if (item.post.quote) return { kind: "인용 원문", ...item.post.quote };
  return null;
};

export function XPostHistoryManager({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [memberUid, setMemberUid] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([undefined]);
  const [confirmPost, setConfirmPost] = useState<XHistoryPostDto | null>(null);
  const cursor = cursorStack.at(-1);
  const query = useMemo(() => ({
    memberUid: memberUid === "all" ? undefined : Number(memberUid),
    status: status === "all" ? undefined : status,
    from: from ? new Date(`${from}T00:00:00+09:00`).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59.999+09:00`).toISOString() : undefined,
    cursor,
    limit: 50,
  }), [cursor, from, memberUid, status, to]);

  const membersQuery = useQuery({
    queryKey: queryKeys.members.active(),
    queryFn: fetchActiveMembers,
    staleTime: 5 * 60_000,
  });
  const historyQuery = useQuery({
    queryKey: queryKeys.memberPosts.xHistory(query),
    queryFn: () => fetchXHistoryPosts(query),
    enabled,
    staleTime: 30_000,
  });
  const redactMutation = useMutation({
    mutationFn: redactXHistoryPost,
    onSuccess: async () => {
      setConfirmPost(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.memberPosts.all });
      toast({ variant: "success", description: "원문과 미디어를 제거하고 공개 피드에서 숨겼습니다." });
    },
    onError: (error) => {
      console.error("Failed to redact X post:", error);
      toast({ variant: "error", description: "X 게시물 원문 제거에 실패했습니다." });
    },
  });

  const resetPage = () => setCursorStack([undefined]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">X 전체 기록</CardTitle>
            <CardDescription>
              관리자 전용 영구 아카이브입니다. 원문 제거는 복원할 수 없으며 tombstone과 감사 기록은 남습니다.
            </CardDescription>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => void historyQuery.refetch()} disabled={!enabled || historyQuery.isFetching}>
            {historyQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-1">새로고침</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!enabled ? (
          <p className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
            기록 분석 킬스위치가 꺼져 있습니다. 원본 수집은 계속되며 다시 켜면 저장된 원문에서 색인을 보충합니다.
          </p>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1"><Label>멤버</Label><Select value={memberUid} onValueChange={(value) => { setMemberUid(value); resetPage(); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 멤버</SelectItem>{(membersQuery.data ?? []).map((member) => <SelectItem key={member.uid} value={String(member.uid)}>{member.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label>상태</Label><Select value={status} onValueChange={(value) => { setStatus(value as StatusFilter); resetPage(); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 상태</SelectItem><SelectItem value="visible">표시 중</SelectItem><SelectItem value="redacted">원문 제거됨</SelectItem></SelectContent></Select></div>
              <div className="space-y-1"><Label htmlFor="x-history-from">시작일</Label><Input id="x-history-from" type="date" value={from} onChange={(event) => { setFrom(event.target.value); resetPage(); }} /></div>
              <div className="space-y-1"><Label htmlFor="x-history-to">종료일</Label><Input id="x-history-to" type="date" value={to} onChange={(event) => { setTo(event.target.value); resetPage(); }} /></div>
            </div>

            {historyQuery.isLoading ? (
              <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />기록 불러오는 중...</div>
            ) : historyQuery.isError ? (
              <p className="rounded-md border border-destructive/40 p-4 text-sm text-destructive">X 전체 기록을 불러오지 못했습니다.</p>
            ) : historyQuery.data?.posts.length === 0 ? (
              <p className="rounded-md border p-4 text-sm text-muted-foreground">조건에 맞는 기록이 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {historyQuery.data?.posts.map((item) => {
                  const referenced = getReferencedPost(item);
                  return <article key={item.postId} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong>{item.memberName}</strong>
                        <Badge variant="outline">{postKindLabel[item.postType]}</Badge>
                        <Badge variant={item.status === "visible" ? "default" : "secondary"}>{item.status === "visible" ? "표시 중" : "원문 제거됨"}</Badge>
                      </div>
                      <time className="text-xs text-muted-foreground">게시 {formatDate(item.createdAt)} · 확인 {formatDate(item.firstSeenAt)}</time>
                    </div>
                    {item.post ? (
                      <>
                        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{item.post.text}</p>
                        {referenced && (
                          <div className="mt-3 rounded-md border bg-muted/20 p-3 text-sm">
                            <p className="mb-1 font-medium">{referenced.kind}</p>
                            {referenced.post ? (
                              <>
                                <p className="whitespace-pre-wrap break-words text-muted-foreground">
                                  {referenced.post.text}
                                </p>
                                <a href={referenced.post.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs underline">
                                  참조 게시물 열기 <ExternalLink className="h-3 w-3" />
                                </a>
                              </>
                            ) : (
                              <a href={`https://x.com/i/web/status/${referenced.postId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline">
                                참조 ID로 X에서 열기 <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        )}
                        {item.post.media.length > 0 && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{item.post.media.map((media) => media.previewImageUrl || media.url ? <img key={media.mediaKey} src={media.previewImageUrl ?? media.url ?? ""} alt={media.altText ?? "X 게시물 미디어"} className="aspect-video w-full rounded-md border object-cover" loading="lazy" /> : null)}</div>}
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>미디어 {item.mediaCount}</span><span>링크 {item.linkCount}</span><a href={item.post.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">X 원문 <ExternalLink className="h-3 w-3" /></a></div>
                        <Button type="button" size="sm" variant="destructive" className="mt-3" onClick={() => setConfirmPost(item)}><ShieldX className="mr-1 h-4 w-4" />원문 제거 및 숨김</Button>
                      </>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">원문과 미디어가 제거되었습니다. 게시물 ID {item.postId}{item.hiddenAt ? ` · ${formatDate(item.hiddenAt)}` : ""}</p>
                    )}
                  </article>;
                })}
              </div>
            )}

            <div className="flex justify-between">
              <Button type="button" variant="outline" disabled={cursorStack.length <= 1 || historyQuery.isFetching} onClick={() => setCursorStack((current) => current.slice(0, -1))}>이전</Button>
              <Button type="button" variant="outline" disabled={!historyQuery.data?.hasMore || !historyQuery.data.nextCursor || historyQuery.isFetching} onClick={() => setCursorStack((current) => [...current, historyQuery.data?.nextCursor ?? undefined])}>다음</Button>
            </div>
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmPost !== null} onOpenChange={(open) => { if (!open) setConfirmPost(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 게시물의 원문을 영구 제거할까요?</AlertDialogTitle>
            <AlertDialogDescription>본문과 미디어 URL을 제거하고 공개 피드에서 숨깁니다. 이 작업은 복원할 수 없지만 게시물 ID와 tombstone, 감사 기록은 유지됩니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={redactMutation.isPending} onClick={(event) => { event.preventDefault(); if (confirmPost) redactMutation.mutate(confirmPost.postId); }}>
              {redactMutation.isPending ? "제거 중..." : "영구 제거"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
