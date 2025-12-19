import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
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
import logoHiBlueming from "@/assets/logo_hiblueming.png";
import logoLuvdia from "@/assets/logo_luvdia.webp";
import logoStardays from "@/assets/logo_stardays.png";
import { format } from "date-fns";

export const Route = createFileRoute("/profile/$code")({
  component: ProfilePage,
});

const LoadingAnimation = () => {
  return (
    <div className="flex items-center justify-center flex-col flex-1 w-full bg-background">
      <div className="flex gap-2">
        {["var(--otw-1)", "var(--otw-2)", "var(--otw-3)"].map(
          (color, index) => (
            <motion.div
              key={index}
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: color }}
              animate={{
                y: ["0%", "-50%", "0%"],
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                ease: "easeInOut",
                delay: index * 0.2,
              }}
            />
          )
        )}
      </div>
    </div>
  );
};

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
    return <LoadingAnimation />;
  }

  if (error || !member) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 w-full gap-4 bg-background">
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

  // Unit Logo Logic
  const getUnitLogo = (unitName?: string) => {
    if (!unitName) return null;
    const name = unitName.toLowerCase().replace(/\s+/g, "");
    if (name.includes("하이블루밍")) return logoHiBlueming;
    if (name.includes("러브다이아")) return logoLuvdia;
    if (name.includes("스타데이즈")) return logoStardays;
    return null;
  };

  const unitLogo = getUnitLogo(member.unit_name);

  return (
    <div className="flex flex-col flex-1 w-full overflow-y-auto bg-background p-4 sm:p-6 lg:p-8">
      <motion.div
        className="max-w-7xl mx-auto space-y-6"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: {
            opacity: 1,
            transition: {
              staggerChildren: 0.1,
            },
          },
        }}
      >
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
        <div className="grid grid-cols-1 md:grid-cols-6 lg:grid-cols-12 gap-4 auto-rows-[minmax(160px,auto)]">
          {/* 1. Hero Profile Card (Large) */}
          <motion.div
            className="md:col-span-6 lg:col-span-8 md:row-span-2 relative overflow-hidden rounded-[24px] md:rounded-[32px] p-6 md:p-8 flex flex-col justify-between group transition-all duration-500 hover:shadow-2xl"
            style={{
              backgroundColor: mainColor,
              color: contrastText,
              boxShadow: `0 20px 40px -10px ${hexToRgba(mainColor, 0.4)}`,
            }}
            variants={{
              hidden: { opacity: 0, x: -50 },
              visible: {
                opacity: 1,
                x: 0,
                transition: { type: "spring", stiffness: 260, damping: 20 },
              },
            }}
          >
            <div className="relative z-10 flex flex-col h-full justify-between gap-4">
              <div className="space-y-2">
                {member.unit_name && (
                  <span className="inline-block px-3 py-1 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-widest bg-black/10 backdrop-blur-sm self-start">
                    {member.unit_name}
                  </span>
                )}
                <h1 className="text-3xl sm:text-4xl md:text-7xl font-black tracking-tight leading-none bg-gradient-to-r from-white via-white/90 to-white/70 bg-clip-text text-transparent break-keep">
                  {member.name}
                </h1>
                <p className="text-xl md:text-2xl font-medium opacity-90 flex items-center gap-2"></p>
              </div>

              <div className="space-y-1">
                <p className="text-xs md:text-sm font-bold opacity-60 uppercase tracking-widest">
                  Introduction
                </p>
                <p className="text-base md:text-lg font-medium leading-relaxed max-w-2xl text-pretty opacity-90">
                  {member.introduction}
                </p>
              </div>
            </div>

            <div className="absolute bottom-0 right-0 p-8 opacity-10">
              <Sparkles className="w-24 h-24" />
            </div>

            {/* Unit Logo */}
            {unitLogo && (
              <div className="absolute top-8 right-8 z-20">
                <div className="bg-white/90 backdrop-blur-sm p-3 rounded-2xl shadow-lg transform transition-transform duration-300 hover:scale-105">
                  <img
                    src={unitLogo}
                    alt={`${member.unit_name} Logo`}
                    className="h-12 w-auto object-contain max-w-[120px]"
                  />
                </div>
              </div>
            )}
          </motion.div>

          {/* 2. Photo Card (Medium) */}
          <motion.div
            className="md:col-span-3 lg:col-span-4 row-span-2 relative rounded-[32px] overflow-hidden group bg-card border border-border/50 shadow-sm hover:shadow-xl transition-all duration-300"
            variants={{
              hidden: { opacity: 0, x: 50 },
              visible: {
                opacity: 1,
                x: 0,
                transition: { type: "spring", stiffness: 260, damping: 20 },
              },
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-transparent to-black/10 z-10" />
            <img
              src={`/profile/${member.code}.webp`}
              alt={member.name}
              className="w-full h-full object-cover transform transition-transform duration-700 group-hover:scale-105"
            />
          </motion.div>

          {/* 3. Info Block: Basic (Small) */}
          <motion.div
            className="md:col-span-3 lg:col-span-4 bg-card rounded-[32px] p-6 flex flex-col justify-between border border-border/50 shadow-sm hover:shadow-lg transition-all duration-300 group"
            variants={{
              hidden: { opacity: 0, y: 50 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { type: "spring", stiffness: 260, damping: 20 },
              },
            }}
          >
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
                  {member.birth_date
                    ? format(new Date(member.birth_date), "M월 d일")
                    : "Unknown"}
                </span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-sm text-muted-foreground font-medium">
                  Debut
                </span>
                <span className="text-lg font-bold">
                  {member.debut_date
                    ? format(new Date(member.debut_date), "yyyy년 M월 d일")
                    : "Unknown"}
                </span>
              </div>
            </div>
          </motion.div>

          {/* 4. Info Block: Fan (Small) */}
          <motion.div
            className="md:col-span-3 lg:col-span-4 rounded-[32px] p-6 flex flex-col justify-between shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 relative overflow-hidden"
            style={{ backgroundColor: subColor, color: subContrastText }}
            variants={{
              hidden: { opacity: 0, x: 50 },
              visible: {
                opacity: 1,
                x: 0,
                transition: { type: "spring", stiffness: 260, damping: 20 },
              },
            }}
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
                {member.oshi_mark}
              </p>
              <p className="opacity-70 text-sm mt-1 font-medium">
                Official Fan Name
              </p>
            </div>
            <div className="absolute -right-4 -bottom-4 opacity-10 rotate-[-15deg]">
              <Music className="w-32 h-32" />
            </div>
          </motion.div>

          {/* 5. Social Links (Row) */}
          <motion.div
            className="md:col-span-6 lg:col-span-4 flex flex-wrap md:flex-nowrap gap-4"
            variants={{
              hidden: { opacity: 0, y: 50 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { type: "spring", stiffness: 260, damping: 20 },
              },
            }}
          >
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
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
