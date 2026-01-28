import { useScheduleData } from "@/hooks/use-schedule-data";
import { useAllMembersLatestVods } from "@/hooks/use-chzzk-vods";
import { VodCard } from "./vod-card";
import { cn, getContrastColor, hexToRgba } from "@/lib/utils";
import { ChevronRight, Loader2, VideoOff, MonitorPlay } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { YouTubeSection } from "@/features/youtube/youtube-section";

export const VodsOverview = () => {
  const { members, loading: membersLoading } = useScheduleData();
  const { vods, loading: vodsLoading } = useAllMembersLatestVods(members);

  const loading = membersLoading || vodsLoading;
  const showInitialLoading = loading && members.length === 0;

  // 치지직 채널이 있는 멤버만 필터링
  const membersWithChzzk = members.filter((m) => m.url_chzzk);

  return (
    <div className="flex flex-1 w-full overflow-y-auto">
      <div className="container mx-auto px-4 py-8 space-y-12">
        {/* YouTube 섹션 */}
        <YouTubeSection members={members} />

        {/* 치지직 섹션 */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <MonitorPlay className="w-6 h-6 text-green-500" />
            <h1 className="text-2xl font-bold text-foreground">
              치지직 최신 다시보기
            </h1>
          </div>

          {showInitialLoading ? (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 w-full">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">다시보기를 불러오는 중...</p>
            </div>
          ) : membersWithChzzk.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 w-full">
              <VideoOff className="w-12 h-12 text-muted-foreground" />
              <p className="text-muted-foreground">치지직 채널이 등록된 멤버가 없습니다.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5 gap-5 xl:auto-cols-[minmax(260px,1fr)]">
              {membersWithChzzk.map((member) => {
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
                            className="rounded-full bg-white/10 hover:bg-white/20"
                            style={{ color: headerTextColor }}
                            aria-label={`${member.name} 치지직 채널로 이동`}
                          >
                            <a
                              href={member.url_chzzk! + "/videos?videoType=&sortType=LATEST&page=1"}
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
                        <VodCard video={video} accentColor={mainColor} size="sm" />
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
        </section>
      </div>
    </div>
  );
};
