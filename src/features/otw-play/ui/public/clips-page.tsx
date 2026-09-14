import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { fetchActiveMembers } from "@/features/members";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import type { PlayPerformanceQuery } from "@contracts/otw-play-playlists";
import { usePlaylistPerformances } from "../../queries/use-playlists";
import { OtwPlayPerformanceActions, OtwPlayParticipantSummary } from "./catalog-components";
import { BroadcastInformation } from "./broadcast-information";
import { OtwPlayQueryError } from "./public-query-state";
import { OtwPlayThumbnail } from "../otw-play-thumbnail";

export function OtwPlayClipsPage() {
  const [filters, setFilters] = useState<PlayPerformanceQuery>({ scope: "broadcast" });
  const query = usePlaylistPerformances(filters);
  const members = useQuery({ queryKey: ["members", "active"], queryFn: fetchActiveMembers });
  const [unknown, setUnknown] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const member = String(values.get("member") ?? "");
    setFilters({ scope: "broadcast", q: String(values.get("q") ?? "").trim() || undefined,
      member: member ? Number(member) : undefined, dateUnknown: unknown || undefined,
      broadcastFrom: unknown ? undefined : String(values.get("from") ?? "") || undefined,
      broadcastTo: unknown ? undefined : String(values.get("to") ?? "") || undefined });
  };
  const items = query.data?.pages.flatMap(page => page.data.items) ?? [];
  return <div className="play-page space-y-6">
    <header><h1 className="play-section-title">노래 클립</h1><p className="mt-2 text-sm text-muted-foreground">방송에서 부른 노래를 최근 카탈로그 공개순으로 만나보세요. 공식 곡과 함께 현재 대기열에 담을 수 있습니다.</p></header>
    <form onSubmit={submit} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1"><Label htmlFor="clips-search">곡 검색</Label><Input id="clips-search" name="q" placeholder="곡 이름" maxLength={80} /></div>
      <div className="space-y-1"><Label htmlFor="clips-member">가창 멤버</Label><select id="clips-member" name="member" className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">전체 멤버</option>{members.data?.map(member => <option key={member.uid} value={member.uid}>{member.name}</option>)}</select></div>
      <div className="space-y-1"><Label htmlFor="clips-from">방송일 시작</Label><Input id="clips-from" name="from" type="date" disabled={unknown} /></div>
      <div className="space-y-1"><Label htmlFor="clips-to">방송일 종료</Label><Input id="clips-to" name="to" type="date" disabled={unknown} /></div>
      <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={unknown} onChange={event => setUnknown(event.target.checked)} />방송일 미확인만 보기</label>
      <Button type="submit" className="lg:col-start-4">검색</Button>
    </form>
    {query.isPending ? <p role="status">노래 클립을 불러오는 중입니다.</p> : query.isError ? <OtwPlayQueryError error={query.error} retry={() => void query.refetch()} /> : items.length === 0 ? <p className="rounded-xl border p-8 text-center text-muted-foreground">조건에 맞는 공개 노래 클립이 없습니다.</p> : <div className="grid gap-4 md:grid-cols-2">
      {items.map(({song, performance}) => <article key={performance.id} className="overflow-hidden rounded-xl border bg-card">
        {performance.selectedSource && <OtwPlayThumbnail source={performance.selectedSource} alt="" width={480} height={270} className="aspect-video w-full object-cover" />}
        <div className="space-y-3 p-4"><h2 className="text-lg font-semibold"><Link className="hover:underline" to="/play/clips/$songSlug" params={{songSlug: song.slug}} search={{performance: performance.id}}>{song.title}</Link></h2>
          <OtwPlayParticipantSummary participants={performance.participants} />
          <BroadcastInformation broadcast={performance.broadcast} />
          {performance.selectedSource && <p className="text-xs text-muted-foreground">{performance.selectedSource.channel.displayName} · {performance.selectedSource.startSeconds}초–{performance.selectedSource.endSeconds}초</p>}
          <OtwPlayPerformanceActions song={song} performance={performance} compact />
        </div>
      </article>)}
    </div>}
    {query.hasNextPage && <Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "불러오는 중" : "더 보기"}</Button>}
  </div>;
}
