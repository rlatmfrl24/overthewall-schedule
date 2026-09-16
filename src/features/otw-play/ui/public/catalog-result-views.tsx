import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { catalogResultDestination, type CatalogResultSong } from "../../model/catalog-result-song";
import { Button } from "@/shared/ui/button";
import { OtwPlayThumbnail } from "../otw-play-thumbnail";
import { OtwPlayPerformanceActions, relationLabel } from "./catalog-components";
import { presentOtwPlayParticipants } from "./participant-presentation";

import { OtwPlayParticipantAvatarGroup } from "./participant-avatar-group";
import { ClipProvenance, ClipperChip, ClipperName, ClipBroadcastDate } from "./clip-provenance";

type SongProps = { song: CatalogResultSong };

function Artwork({ song }: SongProps) {
  const source = song.representativePerformance.selectedSource;
  const fallback = <span className="text-center text-[10px] text-muted-foreground">썸네일 없음</span>;
  return (
    <div className="play-result-artwork flex aspect-video shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
      {source ? <OtwPlayThumbnail source={source} alt="" width={480} height={270}
        className="h-full w-full object-contain" fallback={fallback} /> : fallback}
    </div>
  );
}

function SongIdentity({ song, overlay = false }: SongProps & { overlay?: boolean }) {
  return (
    <div className="min-w-0">
      <Link {...catalogResultDestination(song)}
        className={overlay ? "play-grid-detail-link line-clamp-2 break-words font-bold" : "line-clamp-2 break-words font-semibold hover:underline"}
        aria-label={overlay ? `${song.title} 곡 상세` : undefined} title={song.title}>
        {song.title}
      </Link>
      <p className="mt-1 truncate text-xs text-muted-foreground"
        title={(song.originalArtists ?? []).map(({ displayName }) => displayName).join(", ")}>
        {(song.originalArtists ?? []).map(({ displayName }) => displayName).join(", ") || "아티스트 정보 없음"}
      </p>
      {!song.playable && <p className="mt-1 text-xs text-muted-foreground">현재 재생 불가</p>}
    </div>
  );
}

function Participants({ song }: SongProps) {
  const names = presentOtwPlayParticipants(song.representativePerformance.participants).primaryNames;
  return <span className="line-clamp-2 break-words" title={names}>{names || "참여자 정보 없음"}</span>;
}


function Actions({ song, grid = false }: SongProps & { grid?: boolean }) {
  return (
    <div className={`${grid ? "play-grid-actions" : "play-result-actions"} flex items-center gap-1`}>
      <OtwPlayPerformanceActions song={song} performance={song.representativePerformance} compact iconOnly className="flex-nowrap gap-1" />
      {!grid && <Button asChild variant="outline" size="icon-sm">
        <Link {...catalogResultDestination(song)}
          aria-label={`${song.title} 곡 상세`} title="곡 상세">
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>}
    </div>
  );
}

export function OtwPlaySongGrid({ songs }: { songs: CatalogResultSong[] }) {
  return (
    <div className="play-result-grid" aria-label="곡 그리드">
      {songs.map(song => (
        <article key={`${song.id}:${song.representativePerformance.id}`} className="play-grid-card">
          <Artwork song={song} />
          <ClipperChip performance={song.representativePerformance} />
          <div className="play-grid-copy">
            <div className="play-grid-metadata">
            <SongIdentity song={song} overlay />
            <OtwPlayParticipantAvatarGroup participants={song.representativePerformance.participants} />
            </div>
            <Actions song={song} grid />
            {song.representativePerformance.releaseType === "broadcast" && <div className="col-span-full min-w-0 border-t border-white/20 pt-2">
              <ClipProvenance performance={song.representativePerformance} />
            </div>}
          </div>
        </article>
      ))}
    </div>
  );
}

export function OtwPlaySongTable({ songs }: { songs: CatalogResultSong[] }) {
  const hasClips = songs.some(song => song.representativePerformance.releaseType === "broadcast");
  return (
    <div className="max-w-full overflow-x-auto" tabIndex={hasClips ? 0 : undefined} role={hasClips ? "region" : undefined} aria-label={hasClips ? "노래 클립 표 · 가로 스크롤 가능" : undefined}>
    <table className={`play-result-table w-full table-fixed text-left text-sm ${hasClips ? "play-clip-table" : ""}`} role="table">
      <caption className="sr-only">곡 표 리스트</caption>
      <thead role="rowgroup">
        <tr role="row">
          <th scope="col" role="columnheader">곡 / 원곡 가수</th>
          <th scope="col" role="columnheader" className="play-result-participants">참여자</th>
          <th scope="col" role="columnheader" className="play-result-relation">곡 구분</th>
          {hasClips && <>
            <th scope="col" role="columnheader" className="play-result-clipper">클리퍼</th>
            <th scope="col" role="columnheader" className="play-result-broadcast-date">방송일</th>
          </>}
          <th scope="col" role="columnheader" className="play-result-controls">재생 / 대기열 / 상세</th>
        </tr>
      </thead>
      <tbody role="rowgroup">
        {songs.map(song => (
          <tr key={`${song.id}:${song.representativePerformance.id}`} role="row">
            <td role="cell">
              <div className="flex items-center gap-3">
                <Artwork song={song} />
                <div className="min-w-0 flex-1">
                  <SongIdentity song={song} />
                  <div className="play-result-mobile-meta mt-1 space-y-1 text-xs text-muted-foreground">
                    <Participants song={song} />
                    <span>{relationLabel[song.representativePerformance.relation]}</span>
                  </div>
                </div>
              </div>
            </td>
            <td role="cell" className="play-result-participants text-xs text-muted-foreground"><Participants song={song} /></td>
            <td role="cell" className="play-result-relation text-xs text-muted-foreground">{relationLabel[song.representativePerformance.relation]}</td>
            {hasClips && <>
              <td role="cell" className="play-result-clipper break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{song.representativePerformance.releaseType === "broadcast" ? <ClipperName performance={song.representativePerformance} /> : "—"}</td>
              <td role="cell" className="play-result-broadcast-date text-xs tabular-nums text-muted-foreground">{song.representativePerformance.releaseType === "broadcast" ? <ClipBroadcastDate performance={song.representativePerformance} /> : "—"}</td>
            </>}
            <td role="cell" className="play-result-controls"><Actions song={song} /></td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}
