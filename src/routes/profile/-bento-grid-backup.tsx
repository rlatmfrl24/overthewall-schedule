import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import type { Member } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  ChevronLeft,
  Music,
  Sparkles,
  Twitter,
  Youtube,
} from "lucide-react";
import iconChzzk from "@/assets/icon_chzzk.png";
import logoHiBlueming from "@/assets/logo_hiblueming.png";
import logoLuvdia from "@/assets/logo_luvdia.webp";
import logoStardays from "@/assets/logo_stardays.png";
import { getContrastColor, hexToRgba } from "@/lib/utils";

// Backup only: TanStack Router ignores route files prefixed with "-".
// Keep this Bento-grid profile available for future fallback/reference use.

interface BentoProfileBackupPageProps {
  code: string;
}

const LoadingAnimation = () => {
  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center bg-background">
      <div className="flex gap-2">
        {["var(--otw-1)", "var(--otw-2)", "var(--otw-3)"].map(
          (color, index) => (
            <motion.div
              key={color}
              className="size-4 rounded-full"
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
          ),
        )}
      </div>
    </div>
  );
};

const getUnitLogo = (unitName?: string | null) => {
  if (!unitName) {
    return null;
  }

  const name = unitName.toLowerCase().replace(/\s+/g, "");
  if (name.includes("하이블루밍")) return logoHiBlueming;
  if (name.includes("러브다이아")) return logoLuvdia;
  if (name.includes("스타데이즈")) return logoStardays;
  return null;
};

export function BentoProfileBackupPage({
  code,
}: BentoProfileBackupPageProps) {
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchMember() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/members/${code}`);
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error("Member not found");
          }
          throw new Error("Failed to fetch member");
        }

        const data = await response.json();
        if (!cancelled) {
          setMember(data as Member);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setMember(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchMember();

    return () => {
      cancelled = true;
    };
  }, [code]);

  if (loading) {
    return <LoadingAnimation />;
  }

  if (error || !member) {
    return (
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-4 bg-background">
        <p className="text-xl font-medium text-destructive">
          {error || "멤버를 찾을 수 없습니다"}
        </p>
        <Button variant="outline" asChild>
          <Link to="/">홈으로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  const mainColor = member.main_color || "#71717a";
  const subColor = member.sub_color || member.main_color || "#a1a1aa";
  const contrastText = getContrastColor(mainColor);
  const subContrastText = getContrastColor(subColor);
  const unitLogo = getUnitLogo(member.unit_name);

  return (
    <div className="flex w-full flex-1 flex-col overflow-y-auto bg-background p-4 sm:p-6 lg:p-8">
      <motion.div
        className="mx-auto max-w-7xl space-y-6"
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
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            className="gap-2 pl-0 transition-colors hover:bg-transparent hover:text-primary/80"
            asChild
          >
            <Link to="/">
              <ChevronLeft className="size-5" />
              <span className="text-lg font-medium">돌아가기</span>
            </Link>
          </Button>
        </div>

        <div className="grid auto-rows-[minmax(160px,auto)] grid-cols-1 gap-4 md:grid-cols-6 lg:grid-cols-12">
          <motion.div
            className="group relative flex flex-col justify-between overflow-hidden rounded-[24px] p-6 transition-all duration-500 hover:shadow-2xl md:col-span-6 md:row-span-2 md:rounded-[32px] md:p-8 lg:col-span-8"
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
            <div className="relative z-10 flex h-full flex-col justify-between gap-4">
              <div className="space-y-2">
                {member.unit_name && (
                  <span className="inline-block self-start rounded-full bg-black/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest backdrop-blur-sm md:text-xs">
                    {member.unit_name}
                  </span>
                )}
                <h1 className="break-keep bg-linear-to-r from-white via-white/90 to-white/70 bg-clip-text text-2xl font-black leading-none tracking-normal text-transparent sm:text-4xl md:text-7xl">
                  {member.name}
                </h1>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-widest opacity-60 md:text-sm">
                  Introduction
                </p>
                <p className="max-w-2xl text-pretty text-sm font-medium leading-relaxed opacity-90 md:text-lg">
                  {member.introduction}
                </p>
              </div>
            </div>

            <div className="absolute bottom-0 right-0 p-8 opacity-10">
              <Sparkles className="size-24" />
            </div>

            {unitLogo && (
              <div className="absolute right-8 top-8 z-20">
                <div className="rounded-2xl bg-white/90 p-3 shadow-lg backdrop-blur-sm transition-transform duration-300 hover:scale-105">
                  <img
                    src={unitLogo}
                    alt={`${member.unit_name} Logo`}
                    className="h-12 max-w-[120px] object-contain"
                  />
                </div>
              </div>
            )}
          </motion.div>

          <motion.div
            className="group relative row-span-2 overflow-hidden rounded-[32px] border border-border/50 bg-card shadow-sm transition-all duration-300 hover:shadow-xl md:col-span-3 lg:col-span-4"
            variants={{
              hidden: { opacity: 0, x: 50 },
              visible: {
                opacity: 1,
                x: 0,
                transition: { type: "spring", stiffness: 260, damping: 20 },
              },
            }}
          >
            <div className="absolute inset-0 z-10 bg-linear-to-br from-transparent to-black/10" />
            <img
              src={`/profile/${member.code}.webp`}
              alt={member.name}
              className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          </motion.div>

          <motion.div
            className="group flex flex-col justify-between rounded-[32px] border border-border/50 bg-card p-6 shadow-sm transition-all duration-300 hover:shadow-lg md:col-span-3 lg:col-span-4"
            variants={{
              hidden: { opacity: 0, y: 50 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { type: "spring", stiffness: 260, damping: 20 },
              },
            }}
          >
            <div className="flex items-center gap-3 text-muted-foreground transition-colors group-hover:text-primary">
              <Calendar className="size-6" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                Key Dates
              </span>
            </div>
            <div className="space-y-4 pt-4">
              <div className="flex items-end justify-between border-b border-border/50 pb-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Birthday
                </span>
                <span className="text-lg font-bold">
                  {member.birth_date
                    ? format(new Date(member.birth_date), "M월 d일")
                    : "Unknown"}
                </span>
              </div>
              <div className="flex items-end justify-between">
                <span className="text-sm font-medium text-muted-foreground">
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

          <motion.div
            className="relative flex flex-col justify-between overflow-hidden rounded-[32px] p-6 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl md:col-span-3 lg:col-span-4"
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
              <div className="mb-6 flex items-center gap-2 opacity-80">
                <Music className="size-5" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Fandom
                </span>
              </div>
              <p className="text-3xl font-black tracking-normal">
                {member.fan_name || "Fan"}
                {member.oshi_mark}
              </p>
              <p className="mt-1 text-sm font-medium opacity-70">
                Official Fan Name
              </p>
            </div>
            <div className="absolute -bottom-4 -right-4 rotate-[-15deg] opacity-10">
              <Music className="size-32" />
            </div>
          </motion.div>

          <motion.div
            className="flex flex-wrap gap-4 md:col-span-6 md:flex-nowrap lg:col-span-4"
            variants={{
              hidden: { opacity: 0, y: 50 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { type: "spring", stiffness: 260, damping: 20 },
              },
            }}
          >
            {member.url_twitter && (
              <a
                href={member.url_twitter}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-1 items-center justify-center rounded-[24px] bg-black text-white shadow-lg transition-all duration-300 hover:scale-105 hover:bg-black/80"
              >
                <Twitter className="size-8 transition-transform group-hover:rotate-12" />
              </a>
            )}
            {member.url_youtube && (
              <a
                href={member.url_youtube}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-1 items-center justify-center rounded-[24px] bg-[#ff0000] text-white shadow-lg transition-all duration-300 hover:scale-105 hover:bg-[#d90000]"
              >
                <Youtube className="size-8 transition-transform group-hover:rotate-6" />
              </a>
            )}
            {member.url_chzzk && (
              <a
                href={member.url_chzzk}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-1 items-center justify-center rounded-[24px] bg-[#00ffa3] text-black shadow-lg transition-all duration-300 hover:scale-105 hover:bg-[#00e090]"
              >
                <img
                  src={iconChzzk}
                  alt="Chzzk"
                  className="size-8 object-contain mix-blend-multiply transition-transform group-hover:-rotate-6"
                />
              </a>
            )}
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
