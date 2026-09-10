import { UserRound, UsersRound } from "lucide-react";
import type { OtwPlayPublicParticipantDto } from "@contracts/otw-play";
import { presentOtwPlayParticipants } from "./participant-presentation";

export function OtwPlayParticipantAvatarGroup({ participants }: { participants: OtwPlayPublicParticipantDto[] }) {
  const { primary, primaryNames } = presentOtwPlayParticipants(participants);
  if (!primary.length) return <span className="text-xs text-muted-foreground">참여자 정보 없음</span>;
  return (
    <div className="flex min-w-0 items-center gap-2" aria-label="가창자">
      <span className="flex shrink-0 -space-x-2" aria-hidden="true">
      {primary.slice(0, 3).map(participant => {
        const Icon = participant.kind === "group" ? UsersRound : UserRound;
        return (
            <span key={participant.entityId} className="relative flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-background bg-muted" title={participant.displayName}>
              <Icon className="size-3.5" />
              {participant.kind === "current_member" && <img src={`/profile/${encodeURIComponent(participant.code)}.webp`} alt="" loading="lazy"
                className="absolute inset-0 size-full object-cover" onError={event => { event.currentTarget.hidden = true; }} />}
            </span>
        );
      })}
      </span>
      <span className="min-w-0 truncate text-xs text-muted-foreground" title={primaryNames}>{primaryNames}</span>
    </div>
  );
}
