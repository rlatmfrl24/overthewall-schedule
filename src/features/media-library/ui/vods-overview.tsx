import { Button } from "@/shared/ui/button";
import { useState, useMemo } from "react";
import { ContentPageShell } from "@/shared/ui/content-page-shell";
import { useScheduleData } from "@/features/schedule-board";
import {
  ChzzkClipsPlaylist,
  ChzzkVodsPlaylist,
  useAllMembersClips,
  useAllMembersVods,
} from "@/features/chzzk";
import { cn } from "@/shared/lib/utils";
import { Scissors, Video } from "lucide-react";
import { KirinukiSection, YouTubeSection, YouTubeVodsSection } from "@/features/youtube";
import { MemberFilter } from "@/features/members";
import IconYoutube from "@/assets/icon_youtube.svg";
import IconChzzk from "@/assets/icon_chzzk.png";

type MediaTab = "official-youtube" | "youtube-vods" | "kirinuki" | "chzzk-clips" | "chzzk-vods";

const MEDIA_TABS: Array<{
  value: MediaTab;
  label: string;
  icon: "youtube" | "youtube-vods" | "kirinuki" | "chzzk-clips" | "chzzk-vods";
}> = [
  { value: "official-youtube", label: "공식 유튜브", icon: "youtube" },
  { value: "youtube-vods", label: "유튜브 다시보기", icon: "youtube-vods" },
  { value: "kirinuki", label: "키리누키", icon: "kirinuki" },
  { value: "chzzk-clips", label: "치지직 클립", icon: "chzzk-clips" },
  { value: "chzzk-vods", label: "치지직 다시보기", icon: "chzzk-vods" },
];

const CHZZK_VODS_PER_MEMBER = 10;

interface CompositeTabIconProps {
  baseSrc: string;
  badge?: "scissors" | "video";
  isActive: boolean;
  baseClassName?: string;
}

const CompositeTabIcon = ({
  baseSrc,
  badge,
  isActive,
  baseClassName,
}: CompositeTabIconProps) => {
  const BadgeIcon =
    badge === "scissors" ? Scissors : badge === "video" ? Video : null;

  return (
    <span className="relative size-6 shrink-0" aria-hidden="true">
      <img
        src={baseSrc}
        alt=""
        className={cn("absolute left-0.5 top-0.5 size-5", baseClassName)}
      />
      {BadgeIcon && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 flex size-3 items-center justify-center rounded-full transition-colors motion-reduce:transition-none",
            isActive
              ? "bg-primary"
              : "bg-card group-hover:bg-muted",
          )}
        >
          <BadgeIcon
            className={cn(
              "size-2.5",
              baseSrc === IconYoutube ? "text-red-600" : "text-emerald-500",
            )}
            strokeWidth={2.25}
          />
        </span>
      )}
    </span>
  );
};

const renderTabIcon = (
  icon: (typeof MEDIA_TABS)[number]["icon"],
  isActive: boolean,
) => {
  if (icon === "youtube") {
    return <CompositeTabIcon baseSrc={IconYoutube} isActive={isActive} />;
  }

  if (icon === "youtube-vods") return <CompositeTabIcon baseSrc={IconYoutube} badge="video" isActive={isActive} />;

  if (icon === "kirinuki") {
    return (
      <CompositeTabIcon
        baseSrc={IconYoutube}
        badge="scissors"
        isActive={isActive}
      />
    );
  }

  if (icon === "chzzk-clips") {
    return (
      <CompositeTabIcon
        baseSrc={IconChzzk}
        badge="scissors"
        isActive={isActive}
        baseClassName="rounded"
      />
    );
  }

  return (
    <CompositeTabIcon
      baseSrc={IconChzzk}
      badge="video"
      isActive={isActive}
      baseClassName="rounded"
    />
  );
};

interface MediaTabSwitcherProps {
  activeTab: MediaTab;
  onTabChange: (tab: MediaTab) => void;
}

const MediaTabSwitcher = ({
  activeTab,
  onTabChange,
}: MediaTabSwitcherProps) => (
  <div
    className="flex w-full min-w-0 max-w-full gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-lg border border-border/70 bg-card p-1 shadow-sm"
    role="group"
    aria-label="미디어 종류"
  >
    {MEDIA_TABS.map((tab) => {
      const isActive = activeTab === tab.value;

      return (
        <Button variant="ghost"
          key={tab.value}
          type="button"
          onClick={(event) => { onTabChange(tab.value); event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" }); }}
          aria-pressed={isActive}
          className={cn(
            "group flex shrink-0 min-h-10 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold",
            "outline-none transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-4",
            isActive
              ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground dark:hover:bg-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted",
          )}
        >
          {renderTabIcon(tab.icon, isActive)}
          <span className="truncate">{tab.label}</span>
        </Button>
      );
    })}
  </div>
);

export const VodsOverview = () => {
  const [activeTab, setActiveTab] = useState<MediaTab>("official-youtube");
  const [youtubeMemberFilter, setYoutubeMemberFilter] = useState<
    number[] | null
  >(null);

  const {
    members,
    loading: membersLoading,
    hasLoaded: membersLoaded,
  } = useScheduleData();

  // 치지직 채널이 있는 멤버
  const membersWithChzzk = useMemo(
    () => members.filter((m) => m.url_chzzk),
    [members],
  );

  // 유튜브 채널이 있는 멤버
  const membersWithYouTube = useMemo(
    () => members.filter((m) => m.youtube_channel_id),
    [members],
  );

  const isChzzkClipsTab = activeTab === "chzzk-clips";
  const isChzzkVodsTab = activeTab === "chzzk-vods";
  const {
    vods,
    loading: vodsLoading,
    hasLoaded: vodsLoaded,
  } = useAllMembersVods(membersWithChzzk, CHZZK_VODS_PER_MEMBER, {
    enabled: isChzzkVodsTab,
  });
  const { clips, hasLoaded: clipsLoaded } = useAllMembersClips(
    membersWithChzzk,
    10,
    { enabled: isChzzkClipsTab },
  );

  const showMembersInitialLoading = membersLoading && members.length === 0;
  const showChzzkVodsInitialLoading =
    showMembersInitialLoading ||
    (isChzzkVodsTab && !vodsLoaded && membersWithChzzk.length > 0);
  const showChzzkClipsInitialLoading =
    showMembersInitialLoading ||
    (isChzzkClipsTab && membersWithChzzk.length > 0 && !clipsLoaded);

  return (
    <ContentPageShell
      title="VOD & 클립"
      leadingIcon={<Video className="h-4.5 w-4.5 text-foreground" />}
      actions={
        <MediaTabSwitcher activeTab={activeTab} onTabChange={setActiveTab} />
      }
    >
      {activeTab === "official-youtube" && (
        <MemberFilter
          members={membersWithYouTube}
          selectedUids={youtubeMemberFilter}
          onChange={setYoutubeMemberFilter}
        />
      )}

      {activeTab === "official-youtube" && (
        <YouTubeSection
          members={members}
          selectedMemberUids={youtubeMemberFilter}
          loadingMembers={!membersLoaded}
        />
      )}

      {activeTab === "youtube-vods" && <YouTubeVodsSection members={members} />}

      {activeTab === "kirinuki" && (
        <KirinukiSection members={members} loadingMembers={!membersLoaded} />
      )}

      {activeTab === "chzzk-clips" && (
        <ChzzkClipsPlaylist
          clips={clips}
          members={members}
          loading={showChzzkClipsInitialLoading}
        />
      )}

      {activeTab === "chzzk-vods" && (
        <ChzzkVodsPlaylist
          vods={vods}
          members={members}
          loading={showChzzkVodsInitialLoading || vodsLoading}
          emptyMessage={
            membersWithChzzk.length === 0
              ? "치지직 채널이 등록된 멤버가 없습니다."
              : "다시보기가 없습니다."
          }
        />
      )}
    </ContentPageShell>
  );
};
