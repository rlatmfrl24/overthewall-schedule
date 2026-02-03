import { useState, useMemo } from "react";
import { useScheduleData } from "@/hooks/use-schedule-data";
import { useAllMembersLatestVods } from "@/hooks/use-chzzk-vods";
import { useAllMembersClips } from "@/hooks/use-chzzk-clips";
import { VodCard } from "./vod-card";
import { cn, getContrastColor, hexToRgba } from "@/lib/utils";
import { ChevronRight, VideoOff } from "lucide-react";
import { VodCardSkeleton, VodsGridSkeleton } from "./vod-section-skeleton";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { YouTubeSection } from "@/features/youtube/youtube-section";
import { ChzzkClipsPlaylist } from "@/features/clips/chzzk-clips-playlist";
import { MemberFilterChips } from "@/features/youtube/member-filter-chips";
import IconYoutube from "@/assets/icon_youtube.svg";
import IconChzzk from "@/assets/icon_chzzk.png";

type TabType = "youtube" | "chzzk";

export const VodsOverview = () => {
  const [activeTab, setActiveTab] = useState<TabType>("youtube");
  const [selectedMemberUids, setSelectedMemberUids] = useState<number[] | null>(null);

  const { members, loading: membersLoading, hasLoaded: membersLoaded } = useScheduleData();

  // 치지직 채널이 있는 멤버
  const membersWithChzzk = useMemo(
    () => members.filter((m) => m.url_chzzk),
    [members]
  );

  // 유튜브 채널이 있는 멤버
  const membersWithYouTube = useMemo(
    () => members.filter((m) => m.youtube_channel_id),
    [members]
  );

  const isChzzkTab = activeTab === "chzzk";
  const {
    vods,
    loading: vodsLoading,
    hasLoaded: vodsLoaded,
  } = useAllMembersLatestVods(membersWithChzzk, {
    enabled: isChzzkTab,
  });
  const {
    clips,
    hasLoaded: clipsLoaded,
  } = useAllMembersClips(membersWithChzzk, 10, { enabled: isChzzkTab });

  const loading = membersLoading || (isChzzkTab && vodsLoading);
  const showInitialLoading = loading && members.length === 0;
  const showChzzkInitialLoading =
    isChzzkTab && !vodsLoaded && membersWithChzzk.length > 0;

  // 필터 Chips에 표시할 멤버 (현재 탭에 따라)
  const filterMembers = activeTab === "youtube" ? membersWithYouTube : membersWithChzzk;

  // 필터링된 치지직 멤버
  const filteredChzzkMembers = useMemo(() => {
    if (selectedMemberUids === null || selectedMemberUids.length === 0) {
      return membersWithChzzk;
    }
    return membersWithChzzk.filter((m) => selectedMemberUids.includes(m.uid));
  }, [membersWithChzzk, selectedMemberUids]);

  // 탭 전환 시 필터 초기화
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setSelectedMemberUids(null);
  };

  return (
    <div className="flex flex-1 w-full flex-col overflow-y-auto">
      <div className="container mx-auto px-4 pt-8 pb-8 space-y-6">
        {/* ========== 탭 스위치 ========== */}
        <div className="relative inline-grid grid-cols-2 p-1 rounded-xl bg-muted w-fit">
          <div
            className={cn(
              "absolute inset-y-1 left-1 rounded-lg bg-background shadow-md",
              "w-[calc(50%-0.25rem)] transition-transform duration-300 ease-out"
            )}
            style={{ transform: activeTab === "youtube" ? "translateX(0)" : "translateX(100%)" }}
          />
          <button
            onClick={() => handleTabChange("youtube")}
            className={cn(
              "relative z-10 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium",
              "transition-colors duration-200 ease-out",
              "hover:text-foreground",
              activeTab === "youtube" ? "text-foreground" : "text-muted-foreground"
            )}
          >
            <img src={IconYoutube} alt="YouTube" className="w-5 h-5" />
            <span>YouTube</span>
          </button>
          <button
            onClick={() => handleTabChange("chzzk")}
            className={cn(
              "relative z-10 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium",
              "transition-colors duration-200 ease-out",
              "hover:text-foreground",
              activeTab === "chzzk" ? "text-foreground" : "text-muted-foreground"
            )}
          >
            <img src={IconChzzk} alt="치지직" className="w-5 h-5 rounded" />
            <span>치지직</span>
          </button>
        </div>

        {/* ========== 멤버 필터 Chips (YouTube 탭에서만 표시) ========== */}
        {activeTab === "youtube" && (
          <MemberFilterChips
            members={filterMembers}
            selectedUids={selectedMemberUids}
            onChange={setSelectedMemberUids}
          />
        )}

        {/* ========== 탭 콘텐츠 ========== */}
        {activeTab === "youtube" ? (
          <YouTubeSection
            members={members}
            selectedMemberUids={selectedMemberUids}
            loadingMembers={!membersLoaded}
          />
        ) : (
          <div className="space-y-10">
            {/* 치지직 클립 영역 - 자체 필터 사용 */}
            <ChzzkClipsPlaylist
              clips={clips}
              members={members}
              loading={isChzzkTab && membersWithChzzk.length > 0 && !clipsLoaded}
            />

            {/* 치지직 다시보기 영역 */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 rounded-2xl bg-muted/40 px-4 py-3 shadow-sm">
                <span className="h-7 w-1.5 rounded-full bg-cyan-500/80" />
                <div className="flex flex-col">
                  <h2 className="text-lg font-semibold text-foreground tracking-tight">
                    최신 다시보기
                  </h2>
                </div>
              </div>

              {showInitialLoading || showChzzkInitialLoading ? (
                <VodsGridSkeleton />
              ) : filteredChzzkMembers.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[200px] gap-4 w-full">
                  <VideoOff className="w-12 h-12 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    {selectedMemberUids && selectedMemberUids.length > 0
                      ? "선택한 멤버의 다시보기가 없습니다."
                      : "치지직 채널이 등록된 멤버가 없습니다."}
                  </p>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5 gap-5 xl:auto-cols-[minmax(260px,1fr)] pt-1">
                  {filteredChzzkMembers.map((member) => {
                    const video = vods[member.uid];
                    const mainColor = member.main_color || "#6366f1";
                    const subColor = member.sub_color || mainColor;
                    const headerTextColor = getContrastColor(mainColor);
                    const borderColor = hexToRgba(mainColor, 0.3);
                    const bodyBgColor = hexToRgba(subColor, 0.08);

                    return (
                      <div
                        key={member.uid}
                        className={cn(
                          "group relative flex flex-col overflow-hidden rounded-[20px] transition-all duration-300",
                          "hover:shadow-xl hover:-translate-y-1",
                          "bg-card"
                        )}
                        style={{
                          border: `1px solid ${borderColor}`,
                        }}
                      >
                        {/* 헤더 */}
                        <div
                          className="relative flex items-center gap-3 p-4"
                          style={{ backgroundColor: mainColor }}
                        >
                          <img
                            src={`/profile/${member.code}.webp`}
                            alt={member.name}
                            className="w-12 h-12 rounded-full border-2 border-white/50 object-cover"
                          />
                          <div className="flex-1 min-w-0">
                            <h2
                              className="font-bold text-lg truncate"
                              style={{ color: headerTextColor }}
                            >
                              {member.name}
                            </h2>
                          </div>
                          <Tooltip>
                            <TooltipContent side="bottom">
                              <p>다시보기 리스트로 이동</p>
                            </TooltipContent>
                            <TooltipTrigger asChild>
                              <Button
                                asChild
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "rounded-full bg-white/10 hover:bg-white/20",
                                  "transition-all duration-200 ease-out",
                                  "hover:scale-110 active:scale-95"
                                )}
                                style={{ color: headerTextColor }}
                                aria-label={`${member.name} 치지직 채널로 이동`}
                              >
                                <a
                                  href={
                                    member.url_chzzk! +
                                    "/videos?videoType=&sortType=LATEST&page=1"
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ChevronRight className="w-5 h-5" />
                                </a>
                              </Button>
                            </TooltipTrigger>
                          </Tooltip>
                        </div>

                        {/* 콘텐츠 */}
                        <div
                          className="flex flex-col flex-1 p-4 gap-4"
                          style={{ backgroundColor: bodyBgColor }}
                        >
                          {video ? (
                            <VodCard
                              video={video}
                              accentColor={mainColor}
                              size="sm"
                            />
                          ) : video === undefined && vodsLoading ? (
                            <VodCardSkeleton />
                          ) : (
                            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                              <VideoOff className="w-8 h-8 mb-2 opacity-50" />
                              <p className="text-sm">다시보기 없음</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
