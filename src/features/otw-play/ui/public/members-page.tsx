import { Link } from "@tanstack/react-router";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/shared/ui/button";
import type { OtwPlayCatalogRouteSearch } from "../../model/catalog-route-search";
import { catalogQueryFromRouteSearch } from "../../model/catalog-route-search";
import { useOtwPlayCatalog, useOtwPlayFacets } from "../../queries/use-public-catalog";
import { OtwPlaySongEntry } from "./song-version-list";
import { OtwPlayQueryError } from "./public-query-state";

export function OtwPlayMembersPage({ search, onSearchChange }: {
  search: OtwPlayCatalogRouteSearch;
  onSearchChange: (search: OtwPlayCatalogRouteSearch) => void;
}) {
  const facets = useOtwPlayFacets();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const selected = facets.data?.data.members.find(member => String(member.memberUid) === search.member);
  const catalog = useOtwPlayCatalog(catalogQueryFromRouteSearch({ ...search, participantRole: "vocal" }), { enabled: Boolean(selected) });
  const songs = catalog.data?.pages.flatMap(page => page.data.items) ?? [];
  return <div className="play-page play-reveal">
    <p className="play-eyebrow">OTW PLAY / VOICES</p>
    <h1 className="play-title mt-3">좋아하는 목소리에서.</h1>
    <p className="mt-4 text-sm text-muted-foreground">멤버를 선택하고 메인 보컬로 참여한 공개 음악을 만나보세요.</p>
    {facets.isPending && <p className="py-8" aria-busy="true">멤버 불러오는 중</p>}
    {facets.isError && <OtwPlayQueryError error={facets.error} retry={() => void facets.refetch()} />}
    <div className="play-member-grid" aria-label="현재 멤버 선택">
      {facets.data?.data.members.map(member => <button key={member.memberUid} className="play-member-choice"
        aria-pressed={selected?.memberUid === member.memberUid}
        onClick={() => { setExpandedId(null); onSearchChange({ member: String(member.memberUid), participantRole: "vocal", relation: search.relation, sort: search.sort }); }}>
        <img src={"/profile/" + member.code + ".webp"} width={88} height={88} alt="" />
        <span className="block font-semibold">{member.oshiMark} {member.displayName}</span>
      </button>)}
    </div>
    {!selected ? <div className="play-member-context"><h2 className="play-section-title">어떤 목소리가 듣고 싶나요?</h2><p className="mt-2 text-sm">위에서 멤버를 선택해 주세요.</p></div> : <>
      <section className="play-member-context">
        <p className="play-eyebrow">SELECTED VOICE</p><h2 className="play-section-title mt-2">{selected.displayName}</h2>
        <p className="mt-2 text-sm">메인 보컬로 참여한 공개 음악</p>
        <div className="mt-4 flex flex-wrap gap-2">{([undefined, "original", "cover"] as const).map(relation => <Button key={relation ?? "all"}
          variant="outline" aria-pressed={search.relation === relation} onClick={() => { setExpandedId(null); onSearchChange({ ...search, relation }); }}>
          {relation === "original" ? "오리지널" : relation === "cover" ? "공식 커버" : "전체"}</Button>)}</div>
        <Link className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold" to="/play/songs" search={{ ...search, participantRole: "vocal" }}>곡 탐색에서 더 찾기 <ArrowRight className="size-4" /></Link>
      </section>
      {catalog.isPending || catalog.isPlaceholderData ? <p aria-busy="true" className="flex gap-2 py-8"><LoaderCircle className="size-5 animate-spin" /> 선택한 멤버의 음악 불러오는 중</p> : catalog.isError && !catalog.data ?
        <OtwPlayQueryError error={catalog.error} retry={() => void catalog.refetch()} /> : <>
          {catalog.isError && <OtwPlayQueryError error={catalog.error} retry={() => void catalog.refetch()} />}
          {!songs.length && <p className="py-8 text-muted-foreground">이 조건에 맞는 공개 곡이 없습니다. 다른 관계나 멤버를 선택해 주세요.</p>}
          {songs.map(song => <OtwPlaySongEntry key={song.id} song={song} expanded={expandedId === song.id} onToggle={() => setExpandedId(expandedId === song.id ? null : song.id)} />)}
          {catalog.hasNextPage && <Button className="mt-5" variant="outline" disabled={catalog.isFetchingNextPage} onClick={() => void catalog.fetchNextPage()}>더 보기</Button>}
          {catalog.isFetchNextPageError && <OtwPlayQueryError error={catalog.error} retry={() => void catalog.fetchNextPage()} />}
        </>}
    </>}
  </div>;
}
