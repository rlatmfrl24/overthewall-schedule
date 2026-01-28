import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMemberVods } from "@/hooks/use-chzzk-vods";
import { VodCard } from "./vod-card";
import type { Member } from "@/lib/types";
import { cn, getContrastColor, hexToRgba } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  VideoOff,
} from "lucide-react";
import iconChzzk from "@/assets/icon_chzzk.png";

interface MemberVodsListProps {
  memberCode: string;
}

export const MemberVodsList = ({ memberCode }: MemberVodsListProps) => {
  const [member, setMember] = useState<Member | null>(null);
  const [memberLoading, setMemberLoading] = useState(true);
  const [memberError, setMemberError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMember() {
      try {
        const response = await fetch(`/api/members/${memberCode}`);
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error("Member not found");
          }
          throw new Error("Failed to fetch member");
        }
        const data = await response.json();
        setMember(data as Member);
      } catch (err) {
        setMemberError((err as Error).message);
      } finally {
        setMemberLoading(false);
      }
    }

    fetchMember();
  }, [memberCode]);

  const {
    videos,
    page,
    totalPages,
    totalCount,
    loading: vodsLoading,
    hasNextPage,
    hasPrevPage,
    nextPage,
    prevPage,
  } = useMemberVods(member);

  if (memberLoading) {
    return (
      <div className="flex flex-1 w-full overflow-y-auto">
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 w-full">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">멤버 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (memberError || !member) {
    return (
      <div className="flex flex-1 w-full overflow-y-auto">
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 w-full">
          <VideoOff className="w-12 h-12 text-muted-foreground" />
          <p className="text-lg font-medium text-destructive">
            {memberError || "멤버를 찾을 수 없습니다"}
          </p>
          <Link to="/vods">
            <Button variant="outline">다시보기 목록으로</Button>
          </Link>
        </div>
      </div>
    );
  }

  const mainColor = member.main_color || "#6366f1";
  const headerTextColor = getContrastColor(mainColor);
  const borderColor = hexToRgba(mainColor, 0.3);

  return (
    <div className="flex flex-1 w-full overflow-y-auto">
      <div className="container mx-auto px-4 py-8">
        {/* 뒤로가기 */}
        <Link to="/vods" className="inline-block mb-6">
          <Button
            variant="ghost"
            className="gap-2 pl-0 hover:bg-transparent hover:text-primary/80 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="font-medium">다시보기 목록</span>
          </Button>
        </Link>

        {/* 멤버 헤더 */}
        <div
          className={cn(
            "relative overflow-hidden rounded-[24px] p-6 mb-8",
            "transition-all duration-300 hover:shadow-lg"
          )}
          style={{
            backgroundColor: mainColor,
            border: `1px solid ${borderColor}`,
          }}
        >
          <div className="flex items-center gap-4">
            <img
              src={`/profile/${member.code}.webp`}
              alt={member.name}
              className="w-16 h-16 md:w-20 md:h-20 rounded-full border-3 border-white/50 object-cover"
            />
            <div className="flex-1">
              <h1
                className="text-2xl md:text-3xl font-bold"
                style={{ color: headerTextColor }}
              >
                {member.name}
              </h1>
            </div>

            {member.url_chzzk && (
              <a
                href={member.url_chzzk}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/30 transition-colors"
                style={{ color: headerTextColor }}
              >
                <img src={iconChzzk} alt="Chzzk" className="w-5 h-5" />
                <span className="hidden sm:inline font-medium">치지직 채널</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>

          {/* 통계 */}
          <div className="mt-4 flex gap-6" style={{ color: headerTextColor }}>
            <div>
              <span className="text-2xl font-bold">{totalCount}</span>
              <span className="ml-1 text-sm opacity-80">개의 다시보기</span>
            </div>
          </div>
        </div>

        {/* VOD 리스트 */}
        {vodsLoading ? (
          <div className="flex flex-col items-center justify-center min-h-[200px] gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">다시보기를 불러오는 중...</p>
          </div>
        ) : videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[200px] gap-4">
            <VideoOff className="w-12 h-12 text-muted-foreground" />
            <p className="text-muted-foreground">다시보기가 없습니다.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {videos.map((video) => (
                <VodCard
                  key={video.videoNo}
                  video={video}
                  accentColor={mainColor}
                  size="md"
                />
              ))}
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-8">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hasPrevPage}
                  onClick={prevPage}
                  className="gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  이전
                </Button>

                <span className="text-sm text-muted-foreground">
                  {page + 1} / {totalPages}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hasNextPage}
                  onClick={nextPage}
                  className="gap-1"
                >
                  다음
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
