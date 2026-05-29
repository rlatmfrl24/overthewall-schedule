import { useState, useMemo } from "react";
import { useScheduleData } from "@/hooks/use-schedule-data";
import { useAllMembersVods } from "@/hooks/use-chzzk-vods";
import { useAllMembersClips } from "@/hooks/use-chzzk-clips";
import { cn } from "@/lib/utils";
import { Scissors, Video } from "lucide-react";
import { ChzzkVodsPlaylist } from "./chzzk-vods-playlist";
import { YouTubeSection } from "@/features/youtube/youtube-section";
import { KirinukiSection } from "@/features/youtube/kirinuki-section";
import { ChzzkClipsPlaylist } from "@/features/clips/chzzk-clips-playlist";
import { MemberFilterChips } from "@/features/youtube/member-filter-chips";
import IconYoutube from "@/assets/icon_youtube.svg";
import IconChzzk from "@/assets/icon_chzzk.png";

type MediaTab = "official-youtube" | "kirinuki" | "chzzk-clips" | "chzzk-vods";

const MEDIA_TABS: Array<{
  value: MediaTab;
  label: string;
  icon: "youtube" | "kirinuki" | "chzzk-clips" | "chzzk-vods";
}> = [
  { value: "official-youtube", label: "공식 유튜브", icon: "youtube" },
  { value: "kirinuki", label: "키리누키", icon: "kirinuki" },
  { value: "chzzk-clips", label: "치지직 클립", icon: "chzzk-clips" },
  { value: "chzzk-vods", label: "치지직 다시보기", icon: "chzzk-vods" },
];

const CHZZK_VODS_PER_MEMBER = 10;

interface CompositeTabIconProps {
  baseSrc: string;
  badge: "scissors" | "video";
  isActive: boolean;
  baseClassName?: string;
}

const CompositeTabIcon = ({
  baseSrc,
  badge,
  isActive,
  baseClassName,
}: CompositeTabIconProps) => {
  const BadgeIcon = badge === "scissors" ? Scissors : Video;

  return (
    <span className="relative h-5 w-5 shrink-0" aria-hidden="true">
      <img
        src={baseSrc}
        alt=""
        className={cn(
          "h-5 w-5",
          baseClassName,
          !isActive && "opacity-70",
        )}
      />
      <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-background bg-background shadow-sm">
        <BadgeIcon
          className={cn(
            "h-2.5 w-2.5",
            baseSrc === IconYoutube ? "text-red-600" : "text-emerald-500",
          )}
        />
      </span>
    </span>
  );
};

const renderTabIcon = (
  icon: (typeof MEDIA_TABS)[number]["icon"],
  isActive: boolean,
) => {
  if (icon === "youtube") {
    return <img src={IconYoutube} alt="" className="h-5 w-5 shrink-0" />;
  }

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
  <div className="grid w-full grid-cols-2 gap-1 rounded-xl bg-muted p-1 sm:inline-grid sm:w-fit sm:grid-cols-4">
    {MEDIA_TABS.map((tab) => {
      const isActive = activeTab === tab.value;

      return (
        <button
          key={tab.value}
          type="button"
          onClick={() => onTabChange(tab.value)}
          aria-pressed={isActive}
          className={cn(
            "flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
            "transition-colors duration-200 ease-out hover:text-foreground sm:px-4",
            isActive
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground",
          )}
        >
          {renderTabIcon(tab.icon, isActive)}
          <span className="truncate">{tab.label}</span>
        </button>
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
    <div className="flex flex-1 w-full flex-col overflow-y-auto">
      <div className="container mx-auto px-4 pt-6 pb-8 space-y-4">
        <MediaTabSwitcher activeTab={activeTab} onTabChange={setActiveTab} />

        {activeTab === "official-youtube" && (
          <MemberFilterChips
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
      </div>
    </div>
  );
};
