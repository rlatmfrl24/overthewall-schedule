import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { OtwPlayMemberSongbookQuery } from "@contracts/otw-play-members";
import { buildNotFoundSiteSeo, buildPlayMemberSiteSeo, buildPlaySongPlaceholderSeo } from "@contracts/site-seo";
import { useSiteSeo } from "@/shared/seo/use-site-seo";
import { ApiError } from "@/shared/api/client";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { useOtwPlayConfig, useOtwPlayMemberSongbook } from "../../queries/use-public-catalog";
import { OtwPlaySongRow } from "./catalog-components";

export function OtwPlayMemberSongbookPage({ memberCode, search, onSearchChange }: {
  memberCode: string;
  search: OtwPlayMemberSongbookQuery;
  onSearchChange: (next: OtwPlayMemberSongbookQuery) => void;
}) {
  const query = useOtwPlayMemberSongbook(memberCode, search);
  const config = useOtwPlayConfig();
  const member = query.isError ? undefined : query.data?.data.member;
  const missing = query.error instanceof ApiError && query.error.status === 404;
  const metadata = useMemo(() => member
    ? buildPlayMemberSiteSeo(member, config.data?.data.publicReadEnabled === true)
    : missing ? buildNotFoundSiteSeo(`/play/members/${encodeURIComponent(memberCode)}`)
      : buildPlaySongPlaceholderSeo(`/play/members/${encodeURIComponent(memberCode)}`),
  [member, memberCode, missing, config.data?.data.publicReadEnabled]);
  useSiteSeo(metadata);
  const change = (patch: Partial<OtwPlayMemberSongbookQuery>) => onSearchChange({ ...search, cursor: undefined, ...patch });
  const listRef = useRef<HTMLElement>(null);
  const paginationScope = JSON.stringify([
    memberCode, search.q, search.category, search.participantRole, search.sort, search.limit,
  ]);
  const cursor = search.cursor ?? null;
  const paginationPosition = useRef({ scope: paginationScope, cursor, pending: false });
  const listReady = Boolean(member) && !query.isPlaceholderData;

  useEffect(() => {
    const position = paginationPosition.current;
    // Filter controls keep focus; only a page change within the same list moves it.
    if (position.scope !== paginationScope) {
      paginationPosition.current = { scope: paginationScope, cursor, pending: false };
      return;
    }
    if (position.cursor !== cursor) {
      position.cursor = cursor;
      position.pending = true;
    }
    if (position.pending && listReady && listRef.current) {
      position.pending = false;
      listRef.current.focus({ preventScroll: true });
      listRef.current.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, [paginationScope, cursor, listReady]);

  if (!member) return <section className="py-12 text-center" aria-live="polite">
    <h1 className="text-xl font-bold">{query.isPending ? "멤버 노래 모음 불러오는 중" : missing ? "멤버를 찾을 수 없습니다" : "노래 모음을 불러오지 못했습니다"}</h1>
    {query.isError && !missing && <Button onClick={() => search.cursor ? change({}) : void query.refetch()}>
      {search.cursor ? "처음 목록부터 다시 불러오기" : "다시 시도"}
    </Button>}
    <Link to="/play" className="mt-4 block underline">발견으로 돌아가기</Link>
  </section>;

  return <div className="space-y-6">
    <header className="flex flex-wrap items-center gap-5 rounded-2xl border bg-card p-5 sm:p-8">
      <img src={member.imageUrl} alt="" width={96} height={96} className="size-24 rounded-full object-cover" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm text-muted-foreground">{member.unitName ?? "오버더월"}</p>
        <h1 className="break-keep text-2xl font-bold sm:text-3xl">{member.oshiMark} {member.name} 노래 모음</h1>
        <p>공개 곡 {member.songCount}곡 · 가창 버전 {member.performanceCount}개</p>
        <p className="text-xs text-muted-foreground">메인 보컬·피처링 기준 · 코러스는 역할 필터에서 확인할 수 있어요.</p>
        <Link to="/profile/$code" params={{ code: member.code }} className="inline-flex min-h-11 items-center underline">멤버 프로필</Link>
      </div>
    </header>
    <nav aria-label="노래 분류" className="flex flex-wrap gap-2">
      {([['all', '부른 곡'], ['original', '오리지널'], ['cover', '커버'], ['collaboration', '협업']] as const).map(([value, label]) =>
        <Button key={value} variant={(search.category ?? 'all') === value ? 'default' : 'outline'} aria-pressed={(search.category ?? 'all') === value}
          onClick={() => change({ category: value === 'all' ? undefined : value })}>{label}</Button>)}
    </nav>
    <div className="flex flex-wrap items-end gap-3">
      <SongbookSearch key={search.q ?? ''} value={search.q ?? ''} onSubmit={q => change({ q: q || undefined })} />
      <label className="grid flex-1 gap-1 text-sm sm:flex-none">참여 역할
        <select className="h-11 rounded-md border bg-background px-3" value={search.participantRole ?? ''}
          onChange={event => change({ participantRole: (event.target.value || undefined) as OtwPlayMemberSongbookQuery['participantRole'] })}>
          <option value="">메인 보컬·피처링</option><option value="vocal">메인 보컬</option><option value="featured_vocal">피처링</option><option value="chorus">코러스</option>
        </select>
      </label>
      <label className="grid flex-1 gap-1 text-sm sm:flex-none">정렬
        <select className="h-11 rounded-md border bg-background px-3" value={search.sort ?? 'recent'}
          onChange={event => change({ sort: event.target.value as 'recent' | 'title' })}>
          <option value="recent">최신순</option><option value="title">곡명순</option>
        </select>
      </label>
    </div>
    <section ref={listRef} tabIndex={-1} aria-label="멤버 곡 목록" className="space-y-3" aria-busy={query.isFetching} inert={query.isPlaceholderData || undefined}>
      {query.isPlaceholderData && <p role="status" className="text-sm text-muted-foreground">목록을 불러오는 중입니다.</p>}
      {query.data?.data.items.length ? query.data.data.items.map(song => <OtwPlaySongRow key={song.id} song={song} />)
        : <p className="rounded-xl border p-8 text-center text-muted-foreground">{member.songCount === 0 && !search.q && !search.participantRole ? '아직 공개된 곡이 없습니다.' : '조건에 맞는 곡이 없습니다.'}</p>}
    </section>
    <div className="flex justify-center gap-3">
      {search.cursor && <Button variant="outline" onClick={() => change({})}>처음 목록</Button>}
      {query.data?.nextCursor && <Button disabled={query.isFetching} onClick={() => onSearchChange({ ...search, cursor: query.data!.nextCursor! })}>다음 목록</Button>}
    </div>
  </div>;
}

function SongbookSearch({ value, onSubmit }: { value: string; onSubmit: (q: string) => void }) {
  const [draft, setDraft] = useState(value);
  return <form className="flex w-full min-w-0 items-end gap-2 sm:w-auto sm:flex-1" onSubmit={event => { event.preventDefault(); onSubmit(draft.trim()); }}>
    <label className="grid min-w-0 flex-1 gap-1 text-sm">노래 검색<Input value={draft} maxLength={80} onChange={event => setDraft(event.target.value)} placeholder="곡명·가수 검색" className="h-11" /></label>
    <Button type="submit" className="h-11">검색</Button>
  </form>;
}
