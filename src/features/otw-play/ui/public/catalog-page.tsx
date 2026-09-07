import {
  ChevronDown,
  FilterX,
  LoaderCircle,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { OtwPlayCatalogRouteSearch } from "../../model/catalog-route-search";
import {
  catalogQueryFromRouteSearch,
  memberSearchValue,
} from "../../model/catalog-route-search";
import { useOtwPlayCatalog, useOtwPlayFacets } from "../../queries/use-public-catalog";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Separator } from "@/shared/ui/separator";
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
    onSearchChange(
      {
        ...search,
        member: memberSearchValue(next),
        memberMode: next.length === 0 ? undefined : search.memberMode,
      },
      true,
    );
  };

  const songs = catalog.data?.pages.flatMap((page) => page.data.items) ?? [];
  const activeFilters = buildActiveFilters(search, facets.data?.data);
  const activeFilterCount = activeFilters.filter(({ key }) => key !== "q").length;
  const hasFilters = activeFilters.length > 0;
  const catalogError: unknown = catalog.error;
  const retryCatalog = () => void catalog.refetch();
  const clearFilter = (key: keyof OtwPlayCatalogRouteSearch) => {
    if (key === "member") {
      onSearchChange(
        { ...search, member: undefined, memberMode: undefined },
        true,
      );
      return;
    }
    setField(key, undefined);
  };
  const resetSearch = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = null;
    setSearchInput("");
    onSearchChange({}, true);
  };

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-5 px-3 py-5 sm:px-5 lg:px-7 xl:px-8">
      <div>
        <h1 className="text-2xl font-semibold">곡 검색</h1>
        <p className="text-sm text-muted-foreground">
          곡명, 별칭, 원곡 가수, 참여자와 가창 역할로 공식 버전을 찾습니다.
        </p>
      </div>

      <div className="flex gap-2">
        <form
          role="search"
          className="flex min-w-0 flex-1 gap-2"
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
          className="shrink-0 justify-between sm:min-w-28"
          aria-expanded={filtersOpen}
          aria-controls="otw-play-catalog-filters"
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal /> 필터
            {activeFilterCount > 0 ? (
              <Badge variant="secondary" className="min-w-5 justify-center px-1.5">
                {activeFilterCount}
              </Badge>
            ) : null}
          </span>
          <ChevronDown
            className={`transition-transform ${filtersOpen ? "rotate-180" : ""}`}
          />
        </Button>
      </div>

      {filtersOpen ? (
        <section
          id="otw-play-catalog-filters"
          className="space-y-4 rounded-xl border bg-card p-3 shadow-sm sm:p-4"
          aria-label="카탈로그 필터"
        >
          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold">참여 조건</h2>
              <p className="text-xs text-muted-foreground">
                가창자와 참여 형태를 함께 좁힙니다.
              </p>
            </div>

            {(facets.data?.data.members.length ?? 0) > 0 ? (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">현재 멤버</p>
                <div className="flex flex-wrap gap-1.5">
                  {facets.data?.data.members.map((member) => {
                    const selected = memberUids.includes(member.memberUid);
                    return (
                      <Button
                        key={member.memberUid}
                        type="button"
                        size="sm"
                        variant={selected ? "default" : "outline"}
                        aria-pressed={selected}
                        className="h-8 rounded-full px-2.5 text-xs"
                        onClick={() => toggleMember(member.memberUid)}
                      >
                        {member.oshiMark ? <span aria-hidden="true">{member.oshiMark}</span> : null}
                        {member.displayName}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <FilterSelect
                label="멤버 조건"
                value={search.memberMode ?? "any"}
                disabled={memberUids.length === 0}
                allowAll={false}
                onChange={(value) => setField("memberMode", value === "any" ? undefined : "all")}
                options={[{ value: "any", label: "한 명 이상 포함" }, { value: "all", label: "선택 멤버 모두 참여" }]}
              />
              <FilterSelect
                label="가창 역할"
                value={search.participantRole ?? ""}
                onChange={(value) => setField("participantRole", value as Props["search"]["participantRole"] || undefined)}
                options={[
                  { value: "vocal", label: "메인 보컬" },
                  { value: "featured_vocal", label: "피처링 보컬" },
                  { value: "chorus", label: "코러스" },
                  { value: "other", label: "기타 참여" },
                ]}
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
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold">곡·공개 조건</h2>
              <p className="text-xs text-muted-foreground">
                곡의 관계, 원곡 가수와 공개 시점을 선택합니다.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <FilterSelect
                label="곡 관계"
                value={search.relation ?? ""}
                onChange={(value) => setField("relation", value as Props["search"]["relation"] || undefined)}
                options={[{ value: "original", label: "오리지널" }, { value: "cover", label: "공식 커버" }]}
              />
              <FilterSelect
                label="원곡 가수"
                value={search.originalArtist ?? ""}
                onChange={(value) => setField("originalArtist", value || undefined)}
                options={(facets.data?.data.originalArtists ?? []).map(({ slug, displayName }) => ({ value: slug, label: displayName }))}
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
              <FilterSelect
                label="정렬"
                value={search.sort ?? "recent"}
                allowAll={false}
                onChange={(value) => setField("sort", value === "recent" ? undefined : value as Props["search"]["sort"])}
                options={[{ value: "recent", label: "최신 공개순" }, { value: "title", label: "곡명순" }, { value: "participant", label: "참여자순" }]}
              />
            </div>
          </div>
        </section>
      ) : null}

      {hasFilters ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">적용 중:</span>
          {activeFilters.map(({ key, label }) => (
            <Badge
              key={key}
              variant="outline"
              className="h-8 gap-1 rounded-full bg-card px-2.5 font-normal"
            >
              {label}
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`${label} 필터 제거`}
                onClick={() => clearFilter(key)}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={resetSearch}>
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
          <Button type="button" variant="outline" className="mt-4" onClick={resetSearch}>
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

const ALL_FILTER_VALUE = "__all__";

function FilterSelect({
  label,
  value,
  options,
  onChange,
  allowAll = true,
  disabled = false,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  allowAll?: boolean;
  disabled?: boolean;
}) {
  const selectedValue = allowAll && !value ? ALL_FILTER_VALUE : value;
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select
        value={selectedValue}
        disabled={disabled}
        onValueChange={(next) => onChange(next === ALL_FILTER_VALUE ? "" : next)}
      >
        <SelectTrigger size="sm" className="w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allowAll ? <SelectItem value={ALL_FILTER_VALUE}>전체</SelectItem> : null}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
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
        className="h-8 text-foreground"
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
    participantRole: search.participantRole
      ? `가창 역할 · ${{ vocal: "메인 보컬", featured_vocal: "피처링 보컬", chorus: "코러스", other: "기타 참여" }[search.participantRole]}`
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
