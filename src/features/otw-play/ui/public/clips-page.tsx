import { useEffect, useRef, useState } from "react";
import { ChevronDown, FilterX, LoaderCircle, Search, SlidersHorizontal, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchActiveMembers } from "@/features/members";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Badge } from "@/shared/ui/badge";
import { FilterChip } from "@/shared/ui/filter-chip";
import { QueryState } from "@/shared/ui/query-state";
import { ApiError } from "@/shared/api/client";
import type { PlayPerformanceQuery } from "@contracts/otw-play-playlists";
import { usePlaylistPerformances } from "../../queries/use-playlists";
import { useCatalogView } from "../../model/use-catalog-view";
import { OtwPlaySongRow } from "./catalog-components";
import { OtwPlaySongGrid, OtwPlaySongTable } from "./catalog-result-views";
import { CatalogViewSelector } from "./catalog-view-selector";
import { OtwPlayQueryError } from "./public-query-state";

export function OtwPlayClipsPage() {
  const [filters, setFilters] = useState<PlayPerformanceQuery>({ scope: "broadcast" });
  const [searchInput, setSearchInput] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, changeView] = useCatalogView();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = useRef(false);
  const query = usePlaylistPerformances(filters);
  const members = useQuery({ queryKey: ["members", "active"], queryFn: fetchActiveMembers });
  const [loadMoreTarget, setLoadMoreTarget] = useState<HTMLDivElement | null>(null);
  const { hasNextPage, isFetching, isFetchNextPageError, fetchNextPage } = query;
  useEffect(() => {
    if (!loadMoreTarget || !hasNextPage || isFetching || isFetchNextPageError || typeof IntersectionObserver === "undefined") return;
    let requested = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || requested) return;
      requested = true;
      observer.unobserve(loadMoreTarget);
      void fetchNextPage({ cancelRefetch: false });
    }, { rootMargin: "320px 0px" });
    observer.observe(loadMoreTarget);
    return () => { requested = true; observer.disconnect(); };
  }, [loadMoreTarget, hasNextPage, isFetching, isFetchNextPageError, fetchNextPage]);
  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);
  const change = (patch: Partial<PlayPerformanceQuery>) => setFilters(current => ({ ...current, ...patch, scope: "broadcast" }));
  const submitSearch = (value: string) => {
    if (debounce.current) clearTimeout(debounce.current);
    change({ q: value.trim() || undefined });
  };
  const scheduleSearch = (value: string) => {
    setSearchInput(value);
    if (debounce.current) clearTimeout(debounce.current);
    if (!composing.current) debounce.current = setTimeout(() => submitSearch(value), 250);
  };
  const reset = () => {
    if (debounce.current) clearTimeout(debounce.current);
    setSearchInput(""); setFilters({ scope: "broadcast" });
  };
  const labels = [
    { key: "q", label: filters.q ? `검색 · ${filters.q}` : null },
    { key: "member", label: filters.member ? `멤버 · ${members.data?.find(member => member.uid === filters.member)?.name ?? filters.member}` : null },
    { key: "broadcastFrom", label: filters.broadcastFrom ? `방송 시작일 · ${filters.broadcastFrom}` : null },
    { key: "broadcastTo", label: filters.broadcastTo ? `방송 종료일 · ${filters.broadcastTo}` : null },
    { key: "dateUnknown", label: filters.dateUnknown ? "방송일 미확인" : null },
  ] as const;
  const activeFilters = labels.filter(item => item.label);
  const filterCount = activeFilters.filter(item => item.key !== "q").length;
  const songs = query.data?.pages.flatMap(page => page.data.items.map(({ song, performance }) => ({
    ...song, representativePerformance: performance, playable: performance.playable,
  }))) ?? [];
  return <div className="play-page">
    <header>
      <p className="play-kicker mb-2">Find your music</p>
      <h1 className="play-page-title mb-2">노래 클립</h1>
      <p className="text-sm text-muted-foreground">방송에서 부른 노래를 최근 공개순으로 만나보세요. 가창 멤버와 방송일로 찾을 수 있습니다.</p>
    </header>
    <div className="play-search-controls space-y-3">
      <div className="play-search-row">
        <form role="search" className="flex min-w-0 flex-1 gap-2" onSubmit={event => { event.preventDefault(); if (!composing.current) submitSearch(searchInput); }}>
          <Label htmlFor="clips-search" className="sr-only">곡 검색</Label>
          <div className="relative min-w-0 flex-1">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="clips-search" value={searchInput} placeholder="곡 이름 검색" maxLength={80} className="pl-9"
              onCompositionStart={() => { composing.current = true; if (debounce.current) clearTimeout(debounce.current); }}
              onCompositionEnd={event => { composing.current = false; scheduleSearch(event.currentTarget.value); }}
              onKeyDown={event => { if (event.key === "Enter" && (composing.current || event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault(); }}
              onChange={event => scheduleSearch(event.target.value)} />
          </div>
          <Button type="submit">검색</Button>
        </form>
        <Button type="button" variant="outline" className="shrink-0 justify-between sm:min-w-28" aria-expanded={filtersOpen} aria-controls="otw-play-clips-filters" onClick={() => setFiltersOpen(open => !open)}>
          <span className="flex items-center gap-2"><SlidersHorizontal /> 필터 {filterCount > 0 && <Badge variant="secondary" className="min-w-5 justify-center px-1.5">{filterCount}</Badge>}</span>
          <ChevronDown className={`transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
        </Button>
      </div>
      {members.isPending ? <QueryState state="loading" title="필터 불러오는 중" className="py-3" /> : members.isError ?
        <QueryState state="error" title="멤버 필터를 불러오지 못했습니다." className="rounded-lg border border-destructive/30 p-4"
          action={{ label: "필터 다시 불러오기", onClick: () => void members.refetch(), pending: members.isFetching }} /> : null}
      {filtersOpen && <section id="otw-play-clips-filters" className="play-filter-panel space-y-4 border-t pt-4" aria-label="노래 클립 필터">
        <div className="space-y-3">
          <div><h2 className="text-sm font-semibold">가창 멤버</h2><p className="text-xs text-muted-foreground">방송에서 노래한 멤버를 선택합니다.</p></div>
          <div className="flex flex-wrap gap-1.5">{members.data?.map(member => <FilterChip key={member.uid} selected={filters.member === member.uid}
            className="min-h-8 rounded-full border px-2.5 text-xs" onClick={() => change({ member: filters.member === member.uid ? undefined : member.uid })}>
            {member.name}
          </FilterChip>)}</div>
        </div>
        <div className="space-y-3 border-t pt-4">
          <h2 className="text-sm font-semibold">방송 조건</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1 text-xs font-medium text-muted-foreground"><span>방송일 시작</span><Input type="date" value={filters.broadcastFrom ?? ""} disabled={filters.dateUnknown} className="h-8 text-foreground" onChange={event => change({ broadcastFrom: event.target.value || undefined })} /></label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground"><span>방송일 종료</span><Input type="date" value={filters.broadcastTo ?? ""} disabled={filters.dateUnknown} className="h-8 text-foreground" onChange={event => change({ broadcastTo: event.target.value || undefined })} /></label>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(filters.dateUnknown)} onChange={event => change({ dateUnknown: event.target.checked || undefined, broadcastFrom: undefined, broadcastTo: undefined })} />방송일 미확인만 보기</label>
        </div>
      </section>}
      {activeFilters.length > 0 && <div className="flex flex-wrap items-center gap-2 text-xs"><span className="text-muted-foreground">적용 중:</span>
        {activeFilters.map(({ key, label }) => <Badge key={key} variant="outline" className="h-8 gap-1 rounded-full bg-card px-2.5 font-normal">{label}
          <button type="button" className="play-filter-remove rounded-full p-0.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${label} 필터 제거`} onClick={() => { if (key === "q") { setSearchInput(""); submitSearch(""); } else change({ [key]: undefined }); }}><X className="size-3" /></button>
        </Badge>)}
        <Button type="button" variant="ghost" size="sm" onClick={reset}><FilterX /> 모두 초기화</Button>
      </div>}
    </div>
    <section className="space-y-2" aria-label="검색 결과">
      <CatalogViewSelector view={view} onChange={changeView} />
      {query.isPending ? <QueryState state="loading" title="노래 클립을 불러오는 중입니다." className="min-h-40" /> : query.isError && songs.length === 0 ? <OtwPlayQueryError error={query.error} retry={() => void query.refetch()} /> : songs.length === 0 ?
        <QueryState state="empty" title="조건에 맞는 공개 노래 클립이 없습니다." className="rounded-xl border border-dashed p-10" action={{ label: "필터 초기화", onClick: reset, icon: null }} /> : <>
          {view === "table" ? <OtwPlaySongTable songs={songs} /> : view === "grid" ? <OtwPlaySongGrid songs={songs} /> : <div className="space-y-3">{songs.map(song => <OtwPlaySongRow key={song.representativePerformance.id} song={song} />)}</div>}
          {query.hasNextPage && <div ref={setLoadMoreTarget} className="flex min-h-1 justify-center" aria-label="다음 곡 불러오기">
            {query.isFetchingNextPage && <span role="status" className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> 곡 불러오는 중</span>}
            {!query.isFetchingNextPage && !query.isFetchNextPageError && <Button variant="ghost" onClick={() => void fetchNextPage({ cancelRefetch: false })}>더 보기</Button>}
          </div>}
          {query.isFetchNextPageError && <OtwPlayQueryError error={query.error} retry={query.error instanceof ApiError && (query.error.status === 409 || query.error.code === "PLAY_CURSOR_STALE") ? () => void query.refetch() : () => void fetchNextPage({ cancelRefetch: false })} />}
        </>}
    </section>
  </div>;
}
