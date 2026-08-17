import { Link } from "@tanstack/react-router";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { assembleOtwPlayCollaborationSongs } from "../../model/public-discover";
import {
  useOtwPlayCatalog,
  useOtwPlayFacets,
} from "../../queries/use-public-catalog";
import { OtwPlayQueryError } from "./public-query-state";
import { OtwPlaySection, OtwPlaySongRow } from "./catalog-components";

const pageItems = (query: ReturnType<typeof useOtwPlayCatalog>) =>
  query.data?.pages.flatMap((page) => page.data.items) ?? [];

export function OtwPlayDiscoverPage() {
  const latest = useOtwPlayCatalog({ limit: 1 });
  const originals = useOtwPlayCatalog({ relation: "original", limit: 8 });
  const covers = useOtwPlayCatalog({ relation: "cover", limit: 8 });
  const duet = useOtwPlayCatalog({ participation: "duet", limit: 8 });
  const unit = useOtwPlayCatalog({ participation: "unit", limit: 8 });
  const group = useOtwPlayCatalog({ participation: "group", limit: 8 });
  const external = useOtwPlayCatalog({ participation: "external_collab", limit: 8 });
  const facets = useOtwPlayFacets();
  const queries = [latest, originals, covers, duet, unit, group, external];
  const errorQuery = queries.find(({ isError }) => isError);
  const collaborations = assembleOtwPlayCollaborationSongs([
    pageItems(duet),
    pageItems(unit),
    pageItems(group),
    pageItems(external),
  ]);

  if (queries.some(({ isPending }) => isPending) || facets.isPending) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground" aria-busy="true">
        <LoaderCircle className="mr-2 size-4 animate-spin" /> 공개 카탈로그 불러오는 중
      </div>
    );
  }
  if (errorQuery || facets.isError) {
    const failed = errorQuery ?? facets;
    return (
      <div className="mx-auto max-w-screen-2xl p-4 sm:p-6 lg:p-8">
        <OtwPlayQueryError error={failed.error} retry={() => void failed.refetch()} />
      </div>
    );
  }

  const hero = pageItems(latest)[0];
  const originalSongs = pageItems(originals);
  const coverSongs = pageItems(covers);

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-9 px-3 py-5 sm:px-5 sm:py-7 lg:px-7 xl:px-8">
      {hero ? <OtwPlaySongRow song={hero} hero /> : null}

      <SongSection title="새 오리지널곡" songs={originalSongs} relation="original" />
      <SongSection title="새 공식 커버" songs={coverSongs} relation="cover" />

      <OtwPlaySection title="멤버로 찾기" description="현재 활동 중인 멤버의 공식 가창을 모아봅니다.">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {facets.data?.data.members.map((member) => (
            <Link
              key={member.memberUid}
              to="/play/songs"
              search={{ member: String(member.memberUid) }}
              className="flex min-w-24 flex-col items-center gap-2 rounded-xl border bg-card p-3 text-center hover:bg-accent"
              aria-label={`${member.displayName} 곡 보기`}
            >
              <img
                src={`/profile/${member.code}.webp`}
                alt=""
                width={56}
                height={56}
                loading="lazy"
                className="size-14 rounded-full border object-cover"
              />
              <span className="text-xs font-medium">
                {member.oshiMark ? <span aria-hidden="true">{member.oshiMark} </span> : null}
                {member.displayName}
              </span>
            </Link>
          ))}
        </div>
      </OtwPlaySection>

      {collaborations.length > 0 ? (
        <OtwPlaySection title="함께 부른 노래" description="듀엣, 유닛, 단체와 외부 협업을 최신 순으로 모았습니다.">
          <div className="space-y-3">
            {collaborations.map((song) => <OtwPlaySongRow key={song.id} song={song} />)}
          </div>
        </OtwPlaySection>
      ) : null}
    </div>
  );
}

function SongSection({
  title,
  songs,
  relation,
}: {
  title: string;
  songs: ReturnType<typeof pageItems>;
  relation: "original" | "cover";
}) {
  if (songs.length === 0) return null;
  return (
    <OtwPlaySection title={title}>
      <div className="space-y-3">
        {songs.map((song) => <OtwPlaySongRow key={song.id} song={song} />)}
      </div>
      <Button asChild variant="outline">
        <Link to="/play/songs" search={{ relation }}>
          더 보기 <ArrowRight />
        </Link>
      </Button>
    </OtwPlaySection>
  );
}
