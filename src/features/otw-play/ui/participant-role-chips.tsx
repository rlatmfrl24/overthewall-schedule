import type { OtwPlayPublicParticipantDto } from "@contracts/otw-play";
import { cn } from "@/shared/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/ui/tooltip";
import { presentOtwPlayParticipants } from "./public/participant-presentation";

export function OtwPlaySupportingRoleChips({
  participants,
  inverse = false,
  className,
}: {
  participants: OtwPlayPublicParticipantDto[];
  inverse?: boolean;
  className?: string;
}) {
  const { supportingGroups } = presentOtwPlayParticipants(participants);

  if (supportingGroups.length === 0) return null;

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {supportingGroups.map((group) => (
        <Tooltip key={group.role}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`${group.label}: ${group.names}`}
              className={cn(
                "inline-flex h-5 cursor-help items-center rounded-full border px-1.5 text-[10px] font-medium leading-none outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                inverse
                  ? "border-white/35 bg-black/30 text-white/90 hover:bg-black/45 focus-visible:ring-white"
                  : "border-border bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {group.label}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6} className="max-w-72">
            <span className="font-semibold">{group.label}</span>
            <span aria-hidden="true"> · </span>
            <span>{group.names}</span>
          </TooltipContent>
        </Tooltip>
      ))}
    </span>
  );
}
