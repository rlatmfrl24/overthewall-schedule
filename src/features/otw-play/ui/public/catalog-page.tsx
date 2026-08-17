import { FilterX, LoaderCircle, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { OtwPlayCatalogRouteSearch } from "../../model/catalog-route-search";
import {
  catalogQueryFromRouteSearch,
  memberSearchValue,
} from "../../model/catalog-route-search";
import { useOtwPlayCatalog, useOtwPlayFacets } from "../../queries/use-public-catalog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { OtwPlaySongRow } from "./catalog-components";
import { OtwPlayQueryError } from "./public-query-state";

type Props = {
  search: OtwPlayCatalogRouteSearch;
  onSearchChange: (next: OtwPlayCatalogRouteSearch, replace?: boolean) => void;
};

export function OtwPlayCatalogPage({ search, onSearchChange }: Props) {
  const [searchInput, setSearchInput] = useState(search.q ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const query = useMemo(() => catalogQueryFromRouteSearch(search), [search]);
  const catalog = useOtwPlayCatalog(query);
  const facets = useOtwPlayFacets();
  const memberUids = query.member ?? [];

  useEffect(() => setSearchInput(search.q ?? ""), [search.q]);
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const submitSearch = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onSearchChange({ ...search, q: value.trim() || undefined }, true);
  };
  const scheduleSearch = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => submitSearch(value), 250);
  };
  const setField = <Key extends keyof OtwPlayCatalogRouteSearch>(
    key: Key,
    value: OtwPlayCatalogRouteSearch[Key],
  ) => onSearchChange({ ...search, [key]: value }, true);
  const toggleMember = (uid: number) => {
    const next = memberUids.includes(uid)
      ? memberUids.filter((value) => value !== uid)
      : [...memberUids, uid];
    setField("member", memberSearchValue(next));
  };

  const songs = catalog.data?.pages.flatMap((page) => page.data.items) ?? [];
  const hasFilters = Object.values(search).some((value) => value !== undefined);
  const catalogError: unknown = catalog.error;
  const retryCatalog = () => void catalog.refetch();

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-5 px-3 py-5 sm:px-5 lg:px-7 xl:px-8">
      <div>
        <h1 className="text-2xl font-semibold">전체 곡</h1>
        <p className="text-sm text-muted-foreground">
          곡명, 별칭, 원곡 가수와 참여자로 공식 버전을 찾습니다.
        </p>
      </div>

      <form
        role="search"
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submitSearch(searchInput);
        }}
      >
        <Label htmlFor="otw-play-search" className="sr-only">곡 검색</Label>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="otw-play-search"
            value={searchInput}
            maxLength={80}
            placeholder="곡명, 원곡 가수, 참여자 검색"
            className="pl-9"
            onChange={(event) => scheduleSearch(event.target.value)}
          />
        </div>
        <Button type="submit">검색</Button>
      </form>

      <Button
        type="button"
        variant="outline"
        className="sm:hidden"
        aria-expanded={filtersOpen}
        aria-controls="otw-play-catalog-filters"
        onClick={() => setFiltersOpen((open) => !open)}
      >
        {filtersOpen ? "필터 닫기" : "필터 열기"}
      </Button>

      <section
        id="otw-play-catalog-filters"
        className={`${filtersOpen ? "block" : "hidden"} space-y-4 rounded-xl border bg-card p-4 sm:block`}
        aria-label="카탈로그 필터"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect
            label="곡 관계"
            value={search.relation ?? ""}
            onChange={(value) => setField("relation", value as Props["search"]["relation"] || undefined)}
            options={[{ value: "original", label: "오리지널" }, { value: "cover", label: "공식 커버" }]}
          />
          <FilterSelect
            label="참여 형태"
            value={search.participation ?? ""}
            onChange={(value) => setField("participation", value as Props["search"]["participation"] || undefined)}
            options={[
              { value: "solo", label: "솔로" },
              { value: "duet", label: "듀엣" },
              { value: "unit", label: "유닛" },
              { value: "group", label: "단체" },
              { value: "external_collab", label: "외부 협업" },
            ]}
          />
          <FilterSelect
            label="그룹·유닛"
            value={search.group ?? ""}
            onChange={(value) => setField("group", value || undefined)}
            options={(facets.data?.data.groups ?? []).map(({ key, displayName, kind }) => ({ value: key, label: `${displayName} · ${kind === "unit" ? "유닛" : "그룹"}` }))}
          />
          <FilterSelect
            label="원곡 가수"
            value={search.originalArtist ?? ""}
            onChange={(value) => setField("originalArtist", value || undefined)}
            options={(facets.data?.data.originalArtists ?? []).map(({ slug, displayName }) => ({ value: slug, label: displayName }))}
          />
          <FilterSelect
            label="정렬"
            value={search.sort ?? "recent"}
            onChange={(value) => setField("sort", value === "recent" ? undefined : value as Props["search"]["sort"])}
            options={[{ value: "recent", label: "최신 공개순" }, { value: "title", label: "곡명순" }, { value: "participant", label: "참여자순" }]}
          />
          <FilterSelect
            label="멤버 조건"
            value={search.memberMode ?? "any"}
            onChange={(value) => setField("memberMode", value === "any" ? undefined : "all")}
            options={[{ value: "any", label: "한 명 이상 포함" }, { value: "all", label: "선택 멤버 모두 참여" }]}
          />
          <DateFilter
            label="공개 시작일"
            value={search.publishedFrom ?? ""}
            onChange={(value) => setField("publishedFrom", value || undefined)}
          />
          <DateFilter
            label="공개 종료일"
            value={search.publishedTo ?? ""}
            onChange={(value) => setField("publishedTo", value || undefined)}
          />
        </div>

        {(facets.data?.data.members.length ?? 0) > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">현재 멤버</p>
            <div className="flex flex-wrap gap-2">
              {facets.data?.data.members.map((member) => {
                const selected = memberUids.includes(member.memberUid);
                return (
                  <button
                    key={member.memberUid}
                    type="button"
                    aria-pressed={selected}
                    className={selected ? "min-h-9 rounded-full bg-foreground px-3 text-xs font-medium text-background" : "min-h-9 rounded-full border bg-background px-3 text-xs font-medium hover:bg-accent"}
                    onClick={() => toggleMember(member.memberUid)}
                  >
                    {member.oshiMark ? <span aria-hidden="true">{member.oshiMark} </span> : null}
                    {member.displayName}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>

      {hasFilters ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">적용 중:</span>
          {buildActiveFilters(search, facets.data?.data).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className="inline-flex min-h-8 items-center gap-1 rounded-full border bg-card px-2.5"
              onClick={() => setField(key as keyof OtwPlayCatalogRouteSearch, undefined)}
            >
              {label} <X className="size-3" />
            </button>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => onSearchChange({}, true)}>
            <FilterX /> 모두 초기화
          </Button>
        </div>
      ) : null}

      {catalog.isPending || facets.isPending ? (
        <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground" aria-busy="true">
          <LoaderCircle className="mr-2 size-4 animate-spin" /> 곡 목록 불러오는 중
        </div>
      ) : catalog.isError ? (
        <OtwPlayQueryError error={catalogError} retry={retryCatalog} />
      ) : songs.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">조건에 맞는 곡이 없습니다.</p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => onSearchChange({}, true)}>
            필터 초기화
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            현재 {songs.length}곡을 불러왔습니다{catalog.hasNextPage ? " · 다음 페이지 있음" : " · 마지막 페이지"}
          </p>
          <div className="space-y-3">
            {songs.map((song) => <OtwPlaySongRow key={song.id} song={song} />)}
          </div>
          {catalog.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                disabled={catalog.isFetchingNextPage}
                onClick={() => void catalog.fetchNextPage()}
              >
                {catalog.isFetchingNextPage ? <LoaderCircle className="animate-spin" /> : null}
                더 보기
              </Button>
            </div>
          ) : null}
          {catalog.isFetchNextPageError ? (
            <OtwPlayQueryError
              error={catalogError}
              retry={retryCatalog}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      <select
        value={value}
        className="h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground"
        onChange={(event) => onChange(event.target.value)}
      >
        {label !== "정렬" && label !== "멤버 조건" ? <option value="">전체</option> : null}
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      <Input
        type="date"
        value={value}
        className="text-foreground"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

type Facets = ReturnType<typeof useOtwPlayFacets>["data"] extends infer Value
  ? Value extends { data: infer Data }
    ? Data
    : never
  : never;

const buildActiveFilters = (
  search: OtwPlayCatalogRouteSearch,
  facets: Facets | undefined,
) => {
  const labels = {
    q: search.q ? `검색 · ${search.q}` : null,
    member: search.member
      ? `멤버 · ${search.member
          .split(",")
          .map((uid) => facets?.members.find(({ memberUid }) => memberUid === Number(uid))?.displayName ?? uid)
          .join(", ")}`
      : null,
    memberMode: search.memberMode === "all" ? "멤버 조건 · 모두 참여" : null,
    group: search.group
      ? `그룹 · ${facets?.groups.find(({ key }) => key === search.group)?.displayName ?? "선택됨"}`
      : null,
    participant: search.participant
      ? `외부 참여자 · ${search.participant.replaceAll("-", " ")}`
      : null,
    relation: search.relation === "original" ? "곡 관계 · 오리지널" : search.relation === "cover" ? "곡 관계 · 공식 커버" : null,
    participation: search.participation
      ? `참여 형태 · ${{ solo: "솔로", duet: "듀엣", unit: "유닛", group: "단체", external_collab: "외부 협업" }[search.participation]}`
      : null,
    originalArtist: search.originalArtist
      ? `원곡 가수 · ${facets?.originalArtists.find(({ slug }) => slug === search.originalArtist)?.displayName ?? "선택됨"}`
      : null,
    publishedFrom: search.publishedFrom ? `시작일 · ${search.publishedFrom}` : null,
    publishedTo: search.publishedTo ? `종료일 · ${search.publishedTo}` : null,
    sort: search.sort === "title" ? "정렬 · 곡명순" : search.sort === "participant" ? "정렬 · 참여자순" : null,
  } satisfies Record<keyof OtwPlayCatalogRouteSearch, string | null>;
  return Object.entries(labels)
    .filter((entry): entry is [keyof OtwPlayCatalogRouteSearch, string] => entry[1] !== null)
    .map(([key, label]) => ({ key, label }));
};
