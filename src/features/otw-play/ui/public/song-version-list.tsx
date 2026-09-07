import { Link } from "@tanstack/react-router";
import { ChevronDown, LoaderCircle } from "lucide-react";
import { useRef } from "react";
import type { OtwPlayPublicSongSummaryDto } from "@contracts/otw-play";
import { Button } from "@/shared/ui/button";
import { useOtwPlaySong } from "../../queries/use-public-catalog";
import { OtwPlayPerformanceActions, OtwPlaySongRow } from "./catalog-components";
import { presentOtwPlayParticipants } from "./participant-presentation";
import { OtwPlayQueryError } from "./public-query-state";

export function OtwPlaySongEntry({ song, expanded, onToggle }: {
  song: OtwPlayPublicSongSummaryDto;
  expanded: boolean;
  onToggle: () => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  return <div className="play-song-entry">
    <OtwPlaySongRow song={song} />
    <Button ref={trigger} variant="ghost" className="mt-2" aria-expanded={expanded}
      aria-label={(expanded ? "버전 접기" : "버전 보기") + " · " + song.title} aria-controls={`versions-${song.id}`} onClick={onToggle}>
      <ChevronDown className={expanded ? "rotate-180" : ""} /> {expanded ? "버전 접기" : "버전 보기"}
      <span className="sr-only"> · {song.title}</span>
    </Button>
    {expanded && <div id={`versions-${song.id}`} className="play-version-list play-reveal">
      <SongVersions song={song} />
      <Button variant="ghost" onClick={() => { onToggle(); trigger.current?.focus(); }}>버전 닫기</Button>
    </div>}
  </div>;
}

function SongVersions({ song }: { song: OtwPlayPublicSongSummaryDto }) {
  const query = useOtwPlaySong(song.slug);
  if (query.isPending) return <p className="flex items-center gap-2 py-4 text-sm" aria-busy="true"><LoaderCircle className="size-4 animate-spin" /> 가창 버전 불러오는 중</p>;
  if (query.isError) return <OtwPlayQueryError error={query.error} retry={() => void query.refetch()} />;
  const detail = query.data?.data;
  if (!detail?.performances.length) return <p className="py-4 text-sm">공개된 가창 버전이 없습니다.</p>;
  return <div aria-label={`${song.title} 가창 버전`}>
    {detail.performances.map(performance => <article className="play-version" key={performance.id}>
      <div className="min-w-0 flex-1">
        <Link className="font-semibold underline-offset-4 hover:underline" to="/play/songs/$songSlug"
          params={{ songSlug: song.slug }} search={{ performance: performance.id }}>
          {presentOtwPlayParticipants(performance.participants).primaryNames || "참여자 정보 없음"}
        </Link>
        <p className="mt-1 text-sm text-muted-foreground">{performance.releasedAt ? new Date(performance.releasedAt).toLocaleDateString("ko-KR") : "공개일 미상"} · {performance.relation === "original" ? "오리지널" : "공식 커버"}</p>
      </div>
      <OtwPlayPerformanceActions song={detail} performance={performance} />
    </article>)}
  </div>;
}
