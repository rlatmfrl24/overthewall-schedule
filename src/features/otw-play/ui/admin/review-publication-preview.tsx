import { useId, useState } from "react";
import { ReviewSegmentPlayer } from "./review-segment-player";
import "../play-glass.css";
import { Eye } from "lucide-react";
import type { OtwPlayBroadcastMetadata, OtwPlayParticipantRole, OtwPlayParticipationType, OtwPlayRelationType } from "@contracts/otw-play";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { BroadcastInformation } from "../public/broadcast-information";
import { OtwPlayPerformanceBadges, OtwPlayPerformanceTags, OtwPlaySongTags } from "../public/catalog-components";
import { otwPlayParticipantRoleLabel, otwPlayParticipantRoleOrder } from "../public/participant-presentation";

export function ReviewPublicationPreview({ videoId, title, originalArtists, songTags, participants, relation, releaseType, participation, performanceTags, broadcast, thumbnailUrl, publishedAt, channelTitle, startSeconds, endSeconds, segmentValid, existingSong }: {
  videoId: string;
  title: string;
  originalArtists: string[];
  songTags: string[];
  participants: { key: string; label: string; participantRole: OtwPlayParticipantRole }[];
  relation: OtwPlayRelationType;
  releaseType: "broadcast" | "official_mv" | "official_video";
  participation: OtwPlayParticipationType;
  performanceTags: string[];
  broadcast: OtwPlayBroadcastMetadata;
  thumbnailUrl: string | null;
  publishedAt: number | null;
  channelTitle: string | null;
  startSeconds: string;
  endSeconds: string;
  segmentValid: boolean;
  existingSong: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  // Draft URLs have not passed the save API's validation yet.
  const safeBroadcast = { ...broadcast, originalUrl: /^https:\/\//i.test(broadcast.originalUrl ?? "") ? broadcast.originalUrl : null };
  const primary = participants.filter((person) => person.participantRole === "vocal");
  return <section className="space-y-3" aria-label="게시 미리보기">
    <Button type="button" variant="outline" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><Eye /> OTW Play 게시 미리보기</Button>
    {open && <div id={id} className="otw-play-glass max-w-5xl space-y-4 rounded-xl border bg-background p-4" style={{ containerName: "play-page", containerType: "inline-size" }}>
      <div>
        <h3 className="font-semibold">게시 후 곡 상세 미리보기</h3>
        <p className="mt-1 text-sm text-muted-foreground">저장 전 현재 입력을 반영합니다. 검수 저장 후 임시 등록·공개 절차를 거쳐야 실제 게시됩니다.</p>
        <p className="mt-1 text-xs text-muted-foreground">{existingSong ? "기존 곡 상세에 이 가창 버전이 추가됩니다. 곡명·원곡 가수·곡 분류는 카탈로그 정보를 사용합니다." : "새 곡 상세에 이 가창 버전이 표시됩니다."} 다른 가창 버전과 목록 정렬은 이 미리보기에 포함하지 않습니다.</p>
      </div>
      <section className="play-detail-hero gap-5 border bg-card p-4 md:p-6">
        <ReviewSegmentPlayer key={`${videoId}:${startSeconds}:${endSeconds}`} videoId={videoId} startSeconds={Number(startSeconds)} endSeconds={endSeconds.trim() ? Number(endSeconds) : null} valid={segmentValid} thumbnailUrl={thumbnailUrl} />
        <div className="flex flex-col justify-center gap-4">
          <div><h4 className="play-detail-title text-2xl sm:text-3xl">{title.trim() || "곡명 미입력"}</h4><p className="mt-2 text-sm text-muted-foreground">원곡 가수 {originalArtists.join(", ") || "정보 없음"}</p></div>
          <div className="flex flex-wrap gap-1.5">{(primary.length ? primary : participants.slice(0, 1)).map(person => <Badge key={person.key} variant="outline">{person.label}</Badge>)}</div>
          <div className="flex flex-wrap gap-2"><OtwPlaySongTags tags={songTags} /><OtwPlayPerformanceBadges performance={{ relation, releaseType, participation, broadcast: safeBroadcast, releasedAt: publishedAt === null ? null : new Date(publishedAt).toISOString() }} /></div>
        </div>
      </section>
      <article className="play-detail-version space-y-3 border bg-card p-4">
        <h4 className="font-semibold">{releaseType === "broadcast" ? "방송 가창" : "공식 버전"}</h4>
        {releaseType === "broadcast" && <BroadcastInformation broadcast={safeBroadcast} />}
        <div className="space-y-2" aria-label="미리보기 가창 credit">{otwPlayParticipantRoleOrder.map(role => {
          const people = participants.filter(person => person.participantRole === role);
          return people.length ? <div key={role} className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-muted-foreground">{otwPlayParticipantRoleLabel[role]}</span>{people.map(person => <Badge key={person.key} variant="outline">{person.label}</Badge>)}</div> : null;
        })}{participants.length === 0 && <p className="text-sm text-muted-foreground">가창자 미입력</p>}</div>
        <OtwPlayPerformanceTags tags={performanceTags} />
        <p className="text-xs text-muted-foreground">{channelTitle || "채널 미확인"}</p>
      </article>
      <p className={segmentValid ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>{segmentValid ? `재생 구간: ${startSeconds || "0"}초부터 ${endSeconds.trim() ? `${endSeconds}초까지` : "영상 끝까지"}` : "재생 구간을 확인하세요. 영상 길이 안의 시작·종료 위치가 필요합니다."}</p>
    </div>}
  </section>;
}
