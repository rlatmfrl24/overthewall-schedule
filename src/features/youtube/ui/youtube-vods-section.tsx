import { useState } from "react";
import type { MemberDto } from "@contracts/members";
import { MemberFilter } from "@/features/members";
import { Button } from "@/shared/ui/button";
import { QueryState } from "@/shared/ui/query-state";
import { useYouTubeVods } from "../queries/use-youtube-vods";
import { YouTubeVideoCard } from "./youtube-video-card";

export function YouTubeVodsSection({ members }: { members: MemberDto[] }) {
  const [selected, setSelected] = useState<number[] | null>(null);
  const query = useYouTubeVods(selected ?? []);
  const first = query.data?.pages[0];
  const items = [...new Map(query.data?.pages.flatMap((page) => page.items).map((item) => [item.videoId, item]) ?? []).values()];
  const state = first?.collection.state;
  const message = state === "unregistered" ? "등록된 유튜브 다시보기 채널이 없습니다." :
    state === "initializing" ? "다시보기 채널의 첫 영상을 수집하고 있습니다. 잠시 후 자동으로 확인합니다." :
    state === "partial" ? "일부 채널의 수집이 지연되고 있습니다. 확인된 영상부터 표시합니다." :
    state === "disabled" ? "다시보기 수집이 중지되어 있습니다." :
    state === "error" ? "다시보기 수집에 실패했습니다. 예약 재시도를 기다리는 중입니다." : null;
  return <section className="space-y-5" aria-label="유튜브 다시보기 목록">
    {first && first.availableMemberUids.length > 0 ? <MemberFilter members={members.filter((member) => first.availableMemberUids.includes(member.uid))} selectedUids={selected} onChange={setSelected} /> : null}
    {query.isPending ? <QueryState state="loading" title="다시보기를 불러오고 있습니다." /> : null}
    {query.isError ? <QueryState state="error" title="다시보기를 불러오지 못했습니다." action={{ onClick: () => void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()), pending: query.isFetching }} /> : null}
    {message ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-4 text-sm" role="status"><p>{message}</p>{state === "error" || state === "disabled" ? <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>다시 확인</Button> : null}</div> : null}
    {!query.isPending && !query.isError && state === "ready" && !items.length ? <QueryState state="empty" title="다시보기가 없습니다." /> : null}
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {items.map((video) => {
        const owners = members.filter((member) => video.memberUids.includes(member.uid));
        return <div key={video.videoId}><YouTubeVideoCard video={video} member={owners.length === 1 ? owners[0] : undefined} layout="grid" />{owners.length > 1 ? <p className="mt-2 text-xs text-muted-foreground">{owners.map((member) => member.name).join(" · ")}</p> : null}</div>;
      })}
    </div>
    {query.hasNextPage ? <div className="flex justify-center"><Button variant="outline" disabled={query.isFetching} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "불러오는 중" : "다시보기 더 보기"}</Button></div> : null}
  </section>;
}
