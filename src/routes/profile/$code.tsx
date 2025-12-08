import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Member } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  Twitter,
  Youtube,
  Calendar,
  Music,
  Sparkles,
} from "lucide-react";
import { getContrastColor, hexToRgba } from "@/lib/utils";
import iconChzzk from "@/assets/icon_chzzk.png";

export const Route = createFileRoute("/profile/$code")({
  component: ProfilePage,
});

function ProfilePage() {
  const { code } = Route.useParams();
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMember() {
      try {
        const response = await fetch(`/api/members/${code}`);
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error("Member not found");
          }
          throw new Error("Failed to fetch member");
        }
        const data = await response.json();
        setMember(data as Member);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    fetchMember();
  }, [code]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="h-16 w-16 bg-muted rounded-full"></div>
          <p className="text-muted-foreground">멤버 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error || !member) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-background">
        <p className="text-xl font-medium text-destructive">
          {error || "멤버를 찾을 수 없습니다"}
        </p>
        <Link to="/">
          <Button variant="outline">홈으로 돌아가기</Button>
        </Link>
      </div>
    );
  }

  // Color logic
  const mainColor = member.main_color || "#71717a"; // zinc-500 fallback
  const subColor = member.sub_color || member.main_color || "#a1a1aa";
  const contrastText = getContrastColor(mainColor);
  const subContrastText = getContrastColor(subColor);

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Link to="/">
            <Button
              variant="ghost"
              className="gap-2 pl-0 hover:bg-transparent hover:text-primary/80 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
              <span className="text-lg font-medium">돌아가기</span>
            </Button>
          </Link>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-6 lg:grid-cols-12 gap-4 auto-rows-[minmax(180px,auto)]">
          {/* 1. Hero Profile Card (Large) */}
          <div
            className="md:col-span-6 lg:col-span-8 md:row-span-2 relative overflow-hidden rounded-[32px] p-8 flex flex-col justify-between group transition-all duration-500 hover:shadow-2xl"
            style={{
              backgroundColor: mainColor,
              color: contrastText,
              boxShadow: `0 20px 40px -10px ${hexToRgba(mainColor, 0.4)}`,
            }}
          >
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div className="space-y-2">
                {member.unit_name && (
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest bg-black/10 backdrop-blur-sm self-start">
                    {member.unit_name}
                  </span>
                )}
                <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-none">
                  {member.name}
                </h1>
                <p className="text-xl md:text-2xl font-medium opacity-90 flex items-center gap-2">
                  {member.oshi_mark}{" "}
                  <span className="text-sm font-normal opacity-75 uppercase tracking-wide">
                    Member Profile
                  </span>
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-bold opacity-60 uppercase tracking-widest">
                  Introduction
                </p>
                <p className="text-lg font-medium leading-relaxed max-w-2xl text-pretty opacity-90">
                  이 세계의 벽을 넘어, 여러분에게 닿기를.
                </p>
              </div>
            </div>

            {/* Background Decorative Image/Pattern */}
            <div className="absolute right-[-10%] bottom-[-10%] w-[60%] h-[60%] opacity-20 rotate-12 transition-transform duration-700 group-hover:rotate-6 group-hover:scale-110">
              <img
                src={`/profile/${member.code}.webp`}
                alt=""
                className="w-full h-full object-contain drop-shadow-2xl"
              />
            </div>
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <Sparkles className="w-24 h-24" />
            </div>
          </div>

          {/* 2. Photo Card (Medium) */}
          <div className="md:col-span-3 lg:col-span-4 row-span-2 relative rounded-[32px] overflow-hidden group bg-card border border-border/50 shadow-sm hover:shadow-xl transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-transparent to-black/30 z-10" />
            <img
              src={`/profile/${member.code}.webp`}
              alt={member.name}
              className="w-full h-full object-cover transform transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute bottom-0 left-0 p-6 z-20 w-full">
              <div className="backdrop-blur-md bg-white/10 dark:bg-black/40 p-4 rounded-2xl border border-white/20">
                <p className="text-white font-bold text-lg">
                  Official Portrait
                </p>
              </div>
            </div>
          </div>

          {/* 3. Info Block: Basic (Small) */}
          <div className="md:col-span-3 lg:col-span-4 bg-card rounded-[32px] p-6 flex flex-col justify-between border border-border/50 shadow-sm hover:shadow-lg transition-all duration-300 group">
            <div className="flex items-center gap-3 text-muted-foreground group-hover:text-primary transition-colors">
              <Calendar className="w-6 h-6" />
              <span className="font-semibold uppercase text-xs tracking-wider">
                Key Dates
              </span>
            </div>
            <div className="space-y-4 pt-4">
              <div className="flex justify-between items-end border-b border-border/50 pb-2">
                <span className="text-sm text-muted-foreground font-medium">
                  Birthday
                </span>
                <span className="text-lg font-bold">
                  {member.birth_date || "Unknown"}
                </span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-sm text-muted-foreground font-medium">
                  Debut
                </span>
                <span className="text-lg font-bold">
                  {member.debut_date || "Unknown"}
                </span>
              </div>
            </div>
          </div>

          {/* 4. Info Block: Fan (Small) */}
          <div
            className="md:col-span-3 lg:col-span-4 rounded-[32px] p-6 flex flex-col justify-between shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 relative overflow-hidden"
            style={{ backgroundColor: subColor, color: subContrastText }}
          >
            <div className="relative z-10">
              <div className="flex items-center gap-2 opacity-80 mb-6">
                <Music className="w-5 h-5" />
                <span className="font-bold text-xs uppercase tracking-wider">
                  Fandom
                </span>
              </div>
              <p className="text-3xl font-black tracking-tight">
                {member.fan_name || "Fan"}
              </p>
              <p className="opacity-70 text-sm mt-1 font-medium">
                Official Fan Name
              </p>
            </div>
            <div className="absolute -right-4 -bottom-4 opacity-10 rotate-[-15deg]">
              <Music className="w-32 h-32" />
            </div>
          </div>

          {/* 5. Social Links (Row) */}
          <div className="md:col-span-6 lg:col-span-4 flex gap-4">
            {/* Twitter */}
            {member.url_twitter && (
              <a
                href={member.url_twitter}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 bg-black hover:bg-black/80 text-white rounded-[24px] flex items-center justify-center transition-all duration-300 hover:scale-105 shadow-lg group"
              >
                <Twitter className="w-8 h-8 transition-transform group-hover:rotate-12" />
              </a>
            )}
            {/* YouTube */}
            {member.url_youtube && (
              <a
                href={member.url_youtube}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 bg-[#ff0000] hover:bg-[#d90000] text-white rounded-[24px] flex items-center justify-center transition-all duration-300 hover:scale-105 shadow-lg group"
              >
                <Youtube className="w-8 h-8 transition-transform group-hover:rotate-6" />
              </a>
            )}
            {/* Chzzk */}
            {member.url_chzzk && (
              <a
                href={member.url_chzzk}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 bg-[#00ffa3] hover:bg-[#00e090] text-black rounded-[24px] flex items-center justify-center transition-all duration-300 hover:scale-105 shadow-lg group"
              >
                <img
                  src={iconChzzk}
                  alt="Chzzk"
                  className="w-8 h-8 object-contain transition-transform group-hover:-rotate-6 mix-blend-multiply"
                />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
