import { ExternalLink, MonitorPlay, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useScheduleData } from "@/hooks/use-schedule-data";
import type { Member } from "@/lib/types";
import { cn, getContrastColor } from "@/lib/utils";
import { buildMulLiveUrl, extractMultiviewChannelId } from "./multiview-utils";

type MultiviewMember = {
  channelId: string;
  member: Member;
};

function getProfileImageUrl(member: Member) {
  return `/profile/${member.code}.webp`;
}

function getMultiviewMembers(members: Member[]) {
  return members.reduce<MultiviewMember[]>((result, member) => {
    const channelId = extractMultiviewChannelId(member.url_chzzk);
    if (channelId) {
      result.push({ channelId, member });
    }
    return result;
  }, []);
}

export function MultiviewPage() {
  const { loading, members } = useScheduleData();
  const multiviewMembers = useMemo(
    () => getMultiviewMembers(members),
    [members],
  );
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);

  const selectedSet = useMemo(
    () => new Set(selectedChannelIds),
    [selectedChannelIds],
  );
  const mulLiveUrl = useMemo(
    () => buildMulLiveUrl(selectedChannelIds),
    [selectedChannelIds],
  );

  const toggleMember = (channelId: string) => {
    setSelectedChannelIds((current) =>
      current.includes(channelId)
        ? current.filter((id) => id !== channelId)
        : [...current, channelId],
    );
  };

  return (
    <main className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
      <section className="shrink-0 border-b border-border bg-card text-card-foreground">
        <div className="flex h-12 items-center gap-3 px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <MonitorPlay className="h-4 w-4 shrink-0 text-primary" />
            <h1 className="truncate text-sm font-bold sm:text-base">
              오버더월 멀티뷰
            </h1>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {selectedChannelIds.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 rounded-md px-2 text-xs"
                onClick={() => setSelectedChannelIds([])}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                초기화
              </Button>
            ) : null}
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-md px-2 text-xs"
            >
              <a href={mulLiveUrl} target="_blank" rel="noopener noreferrer">
                Mul.Live
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        </div>

        <div className="min-w-0 overflow-x-auto px-3 pb-3 sm:px-4">
          <div className="flex min-w-max gap-2">
            {loading ? (
              Array.from({ length: 8 }).map((_, index) => (
                <Skeleton
                  key={index}
                  className="h-9 w-28 rounded-full"
                  aria-hidden="true"
                />
              ))
            ) : multiviewMembers.length > 0 ? (
              multiviewMembers.map(({ channelId, member }) => {
                const selected = selectedSet.has(channelId);
                const accentColor = member.main_color || "#14b8a6";
                const selectedTextColor = getContrastColor(accentColor);

                return (
                  <button
                    key={channelId}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleMember(channelId)}
                    className={cn(
                      "inline-flex h-9 max-w-44 items-center gap-2 rounded-full border px-2.5 text-sm font-semibold outline-none transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      selected
                        ? "shadow-sm"
                        : "bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                    style={
                      selected
                        ? {
                            backgroundColor: accentColor,
                            borderColor: accentColor,
                            color: selectedTextColor,
                          }
                        : {
                            borderColor: accentColor,
                          }
                    }
                  >
                    <img
                      src={getProfileImageUrl(member)}
                      alt=""
                      className="h-6 w-6 shrink-0 rounded-full object-cover"
                      loading="lazy"
                    />
                    <span className="min-w-0 truncate">{member.name}</span>
                  </button>
                );
              })
            ) : (
              <div className="flex h-9 items-center rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground">
                CHZZK 채널이 등록된 멤버가 없습니다.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="min-h-0 flex-1 bg-black">
        <iframe
          key={mulLiveUrl}
          title="Mul.Live multiview"
          src={mulLiveUrl}
          className="block h-full w-full border-0"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </section>
    </main>
  );
}
