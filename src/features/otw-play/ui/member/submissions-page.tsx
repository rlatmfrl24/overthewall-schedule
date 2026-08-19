import { Link } from "@tanstack/react-router";
import { ListPlus, LoaderCircle } from "lucide-react";
import { useState } from "react";
import type {
  OtwPlayMemberSubmissionStatus,
  OtwPlayParticipantRole,
} from "@contracts/otw-play";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  useMyOtwPlaySubmission,
  useMyOtwPlaySubmissions,
} from "../../queries/use-member-submissions";

const labels: Record<OtwPlayMemberSubmissionStatus, string> = {
  pending_review: "검토 대기",
  approved: "승인됨",
  rejected: "반려",
};
const roleLabels: Record<OtwPlayParticipantRole, string> = {
  vocal: "메인 보컬",
  featured_vocal: "피처링 보컬",
  chorus: "코러스",
  other: "기타 참여",
};

export function OtwPlaySubmissionsPage() {
  const list = useMyOtwPlaySubmissions();
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detail = useMyOtwPlaySubmission(selectedId);

  if (list.isPending) {
    return (
      <div className="flex min-h-80 items-center justify-center" aria-busy="true">
        <LoaderCircle className="mr-2 size-5 animate-spin" /> 내 제안을 불러오는 중
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto flex min-h-96 w-full max-w-3xl items-center p-4 sm:p-8">
        <section className="w-full rounded-2xl border bg-card p-8 text-center shadow-sm">
          <ListPlus className="mx-auto size-10 text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-bold">아직 제출한 제안이 없습니다</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            OTW 멤버가 참여한 공식 커버 영상을 알고 있다면 첫 제안을 보내주세요.
          </p>
          <Button asChild className="mt-6">
            <Link to="/play/submit">첫 곡 제안하기</Link>
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-5 p-4 py-8 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)] md:p-8">
      <section className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">내 곡 제안</h1>
          <p className="mt-1 text-sm text-muted-foreground">수정·철회 기능은 정책 확정 전까지 제공하지 않습니다.</p>
        </div>
        <div className="space-y-2">
          {items.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border bg-card p-4 text-left hover:bg-muted/60"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{item.title}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("ko-KR")}</span>
              </span>
              <Badge variant={item.status === "approved" ? "default" : "secondary"}>{labels[item.status]}</Badge>
            </button>
          ))}
        </div>
        {list.hasNextPage ? (
          <Button variant="outline" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>더 보기</Button>
        ) : null}
      </section>

      <aside className="rounded-2xl border bg-card p-5 md:sticky md:top-6 md:self-start">
        {!selectedId ? <p className="text-sm text-muted-foreground">목록에서 제안을 선택하세요.</p> : null}
        {detail.isPending ? <LoaderCircle className="animate-spin" /> : null}
        {detail.data ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-semibold">{detail.data.title}</h2>
              <Badge>{labels[detail.data.status]}</Badge>
            </div>
            <dl className="space-y-3 text-sm">
              <div><dt className="text-muted-foreground">원곡 가수</dt><dd>{detail.data.originalArtists.map((item) => item.displayName).join(", ")}</dd></div>
              <div><dt className="text-muted-foreground">참여자</dt><dd>{detail.data.participants.map((item) => `${item.displayName} · ${roleLabels[item.participantRole]}`).join(", ")}</dd></div>
              {detail.data.note ? <div><dt className="text-muted-foreground">내 메모</dt><dd className="whitespace-pre-wrap">{detail.data.note}</dd></div> : null}
            </dl>
            {detail.data.approvedSong ? (
              detail.data.approvedSong.publicLinkAvailable ? (
                <Link
                  to="/play/songs/$songSlug"
                  params={{ songSlug: detail.data.approvedSong.slug }}
                  search={{ performance: undefined }}
                >
                  <Button className="w-full">승인된 곡 보기</Button>
                </Link>
              ) : (
                <p className="rounded-lg bg-muted p-3 text-sm">승인되었습니다. 운영 공개 준비 중입니다.</p>
              )
            ) : null}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
