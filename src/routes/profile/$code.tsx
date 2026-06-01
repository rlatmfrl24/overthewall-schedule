import { createFileRoute, Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import type { MemberProfile, MemberProfileLink } from "@/lib/types";
import { fetchMemberProfile } from "@/lib/api/members";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Cake,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Heart,
  PlaySquare,
  Sparkles,
  UserRound,
} from "lucide-react";
import iconChzzk from "@/assets/icon_chzzk.png";
import iconNaverCafe from "@/assets/icon_naver_cafe.svg";
import iconX from "@/assets/icon_x.svg";
import iconYoutube from "@/assets/icon_youtube.svg";
import logoHiblueming from "@/assets/logo_hiblueming.png";
import logoLuvdia from "@/assets/logo_luvdia.webp";
import logoStardays from "@/assets/logo_stardays.png";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/profile/$code")({
  component: ProfilePage,
});

const AUTO_ROTATE_MS = 9000;

const formatProfileDate = (value: string | null | undefined) => {
  if (!value || value.startsWith("9999")) {
    const [, month, day] = value?.split("-") ?? [];
    return month && day ? `${month}.${day}` : null;
  }

  const [year, month, day] = value.split("-");
  if (!year || !month || !day) {
    return value;
  }

  return `${year}.${month}.${day}`;
};

const unitLogoMap: Record<string, string> = {
  stardays: logoStardays,
  "스타데이즈": logoStardays,
  luvdia: logoLuvdia,
  "luv dia": logoLuvdia,
  "러브다이아": logoLuvdia,
  "러브 다이아": logoLuvdia,
  hiblueming: logoHiblueming,
  "hi blueming": logoHiblueming,
  "하이블루밍": logoHiblueming,
  "하이 블루밍": logoHiblueming,
};

const getUnitLogo = (unitName: string | null | undefined) => {
  if (!unitName) {
    return null;
  }

  const normalized = unitName.toLowerCase().replace(/\s+/g, " ").trim();
  const compact = normalized.replace(/\s+/g, "");
  return unitLogoMap[normalized] ?? unitLogoMap[compact] ?? null;
};

const LoadingAnimation = () => {
  return (
    <div className="grid h-dvh w-full flex-1 place-items-center bg-zinc-950">
      <div className="flex gap-2">
        {["var(--otw-1)", "var(--otw-2)", "var(--otw-3)"].map(
          (color, index) => (
            <motion.div
              key={color}
              className="size-3 rounded-full"
              style={{ backgroundColor: color }}
              animate={{
                y: ["0%", "-50%", "0%"],
                opacity: [0.45, 1, 0.45],
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

const linkMeta: Record<
  MemberProfileLink["type"],
  {
    label: string;
    Icon?: ComponentType<{
      className?: string;
      "aria-hidden"?: boolean | "true" | "false";
    }>;
    image?: string;
    iconClassName: string;
  }
> = {
  x: {
    label: "X",
    image: iconX,
    iconClassName: "invert",
  },
  naver_cafe: {
    label: "네이버 카페",
    image: iconNaverCafe,
    iconClassName: "",
  },
  youtube: {
    label: "YouTube",
    image: iconYoutube,
    iconClassName: "",
  },
  chzzk: {
    label: "CHZZK",
    image: iconChzzk,
    iconClassName: "",
  },
  youtube_vod: {
    label: "다시보기",
    Icon: PlaySquare,
    iconClassName: "text-white",
  },
  youtube_sub: {
    label: "서브채널",
    Icon: UserRound,
    iconClassName: "text-white",
  },
};

const LinkIcon = ({ link }: { link: MemberProfileLink }) => {
  const meta = linkMeta[link.type];
  const Icon = meta.Icon;

  if (meta.image) {
    return (
      <img
        src={meta.image}
        alt=""
        className={cn("size-5 object-contain", meta.iconClassName)}
      />
    );
  }

  if (Icon) {
    return <Icon className={cn("size-5", meta.iconClassName)} aria-hidden="true" />;
  }

  return <ExternalLink className="size-5" aria-hidden="true" />;
};

const ProfileLinkButton = ({
  link,
  secondary = false,
}: {
  link: MemberProfileLink;
  secondary?: boolean;
}) => {
  const meta = linkMeta[link.type];
  const displayLabel =
    link.type === "naver_cafe" ? "네이버 카페" : link.label || meta.label;

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={displayLabel}
      title={displayLabel}
      className="group flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-white/16 bg-slate-950/48 px-3 text-sm font-semibold text-white shadow-lg shadow-black/15 backdrop-blur-md transition duration-200 hover:border-white/28 hover:bg-white/10 sm:min-h-12 sm:shadow-xl sm:shadow-black/20 lg:min-h-14"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 sm:rounded-md">
          <LinkIcon link={link} />
        </span>
        <span className="truncate">{displayLabel}</span>
      </span>
      {secondary ? (
        <ChevronDown
          className="size-4 shrink-0 opacity-75"
          aria-hidden="true"
        />
      ) : (
        <ExternalLink
          className="size-4 shrink-0 opacity-65 transition group-hover:translate-x-0.5 group-hover:opacity-100"
          aria-hidden="true"
        />
      )}
    </a>
  );
};

const ProfileInfoCapsule = ({
  icon: Icon,
  label,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  children: ReactNode;
}) => {
  return (
    <div className="flex min-h-12 min-w-0 items-center gap-2 overflow-hidden rounded-lg border border-white/12 bg-white/8 px-2.5 py-2 shadow-md shadow-black/10 backdrop-blur-md sm:min-h-16 sm:gap-2.5 sm:py-3 sm:shadow-lg">
      <span className="grid size-8 shrink-0 place-items-center rounded-md border border-white/12 bg-white/10 text-[var(--member-accent)] shadow-inner shadow-white/5 sm:size-9">
        <Icon className="size-3.5 sm:size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 overflow-hidden">
        <span className="block truncate text-[0.68rem] font-semibold leading-none text-white/52 sm:text-xs sm:leading-normal">
          {label}
        </span>
        <span className="mt-1 flex min-w-0 max-w-full flex-nowrap items-center gap-1 overflow-hidden text-sm font-black leading-tight text-white sm:flex-wrap sm:gap-1.5 sm:overflow-visible sm:text-[0.95rem]">
          {children}
        </span>
      </span>
    </div>
  );
};

function ProfilePage() {
  const { code } = Route.useParams();
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [failedProfileBackgroundCode, setFailedProfileBackgroundCode] =
    useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMember() {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchMemberProfile(code);
        if (!cancelled) {
          setMember(data);
          setActiveImageIndex(0);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message || "Failed to fetch member");
          setMember(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadMember();

    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    setFailedProfileBackgroundCode(null);
  }, [code]);

  const profileImages = useMemo(
    () =>
      (member?.profileImages?.length
        ? member.profileImages
        : member
          ? [
            {
              id: null,
              memberUid: member.uid,
              imageUrl: `/profile/${member.code}.webp`,
              alt: `${member.name} 프로필 이미지`,
              sortOrder: 0,
            },
          ]
          : []
      ).slice(0, 3),
    [member],
  );

  const hasMultipleImages = profileImages.length > 1;

  useEffect(() => {
    if (!hasMultipleImages) return;

    const timer = window.setInterval(() => {
      setActiveImageIndex((current) => (current + 1) % profileImages.length);
    }, AUTO_ROTATE_MS);

    return () => window.clearInterval(timer);
  }, [hasMultipleImages, profileImages.length]);

  const activeImage = profileImages[activeImageIndex] ?? profileImages[0];
  const profileBackgroundUrl = member
    ? `/profile-background/${member.code}.webp`
    : null;
  const shouldUseProfileBackground =
    Boolean(profileBackgroundUrl) && failedProfileBackgroundCode !== member?.code;
  const backgroundImageUrl = shouldUseProfileBackground
    ? profileBackgroundUrl
    : activeImage?.imageUrl;
  const showImageControls = hasMultipleImages && !shouldUseProfileBackground;

  const { primaryLinks, secondaryLinks } = useMemo(() => {
    const links = member?.links ?? [];
    return {
      primaryLinks: links.filter(
        (link) =>
          link.type === "x" ||
          link.type === "naver_cafe" ||
          link.type === "youtube" ||
          link.type === "chzzk",
      ),
      secondaryLinks: links.filter(
        (link) => link.type === "youtube_vod" || link.type === "youtube_sub",
      ),
    };
  }, [member]);

  if (loading) {
    return <LoadingAnimation />;
  }

  if (error || !member) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-xl font-medium text-destructive">
          {error || "멤버를 찾을 수 없습니다"}
        </p>
        <Button variant="outline" asChild>
          <Link to="/">홈으로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  const accentColor = member.main_color || "#31a4a9";
  const subColor = member.sub_color || member.main_color || "#f66479";
  const styleVars = {
    "--member-accent": accentColor,
    "--member-sub": subColor,
  } as CSSProperties;
  const birthDate = formatProfileDate(member.birth_date);
  const debutDate = formatProfileDate(member.debut_date);
  const unitLogo = getUnitLogo(member.unit_name);
  const hasInfoCapsules =
    Boolean(member.fan_name) ||
    Boolean(member.oshi_mark) ||
    Boolean(birthDate) ||
    Boolean(debutDate);
  const hasProfileMeta =
    hasInfoCapsules ||
    Boolean(member.introduction);

  const goToImage = (index: number) => {
    const next = (index + profileImages.length) % profileImages.length;
    setActiveImageIndex(next);
  };

  return (
    <main
      className="relative flex h-dvh w-full overflow-x-hidden overflow-y-auto bg-[#07101a] text-white lg:overflow-hidden"
      style={styleVars}
    >
      <AnimatePresence mode="wait">
        {backgroundImageUrl && (
          <motion.img
            key={backgroundImageUrl}
            src={backgroundImageUrl}
            alt={activeImage?.alt ?? `${member.name} 프로필 이미지`}
            className="absolute inset-0 hidden size-full object-cover object-[50%_18%] sm:block sm:object-center"
            initial={{ opacity: 0, scale: 1.03 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.015 }}
            transition={{ duration: 0.65, ease: "easeOut" }}
            onError={() => {
              if (member && backgroundImageUrl === profileBackgroundUrl) {
                setFailedProfileBackgroundCode(member.code);
              }
            }}
          />
        )}
      </AnimatePresence>

      <div className="absolute inset-0 hidden bg-[linear-gradient(90deg,rgba(2,6,14,0.62)_0%,rgba(2,6,14,0.26)_34%,rgba(2,6,14,0.04)_61%,rgba(2,6,14,0.36)_100%)] sm:block" />
      <div className="absolute inset-0 hidden bg-[linear-gradient(180deg,rgba(3,7,18,0.16)_0%,rgba(3,7,18,0.03)_42%,rgba(3,7,18,0.58)_100%)] sm:block" />

      <Button
        variant="ghost"
        className="absolute left-5 top-5 z-20 h-11 gap-2 rounded-lg border border-white/18 bg-slate-950/32 px-3 text-sm font-semibold text-white shadow-xl shadow-black/20 backdrop-blur-md hover:bg-white/12 hover:text-white sm:left-8 sm:px-4"
        asChild
      >
        <Link to="/">
          <ArrowLeft className="size-4" aria-hidden="true" />
          <Calendar className="size-4" aria-hidden="true" />
          <span>스케줄로 돌아가기</span>
        </Link>
      </Button>

      <div className="relative z-10 flex min-h-dvh w-full flex-col justify-start px-5 pb-12 pt-24 sm:justify-end sm:px-8 sm:pb-7 sm:pt-32 lg:grid lg:grid-cols-[minmax(0,1fr)_316px] lg:gap-8 lg:px-14 lg:pb-10 lg:pt-28">
        <section className="flex shrink-0 items-start lg:min-h-0 lg:items-end">
          <motion.div
            className="w-full max-w-[680px] pb-1 lg:-mb-8 lg:max-w-[780px] lg:pb-10"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          >
            {unitLogo && (
              <div className="mb-5 flex items-center lg:mb-6">
                <img
                  src={unitLogo}
                  alt={member.unit_name ? `${member.unit_name} 로고` : "소속 유닛 로고"}
                  className={cn(
                    "h-auto object-contain drop-shadow-[0_10px_24px_rgba(0,0,0,0.45)]",
                    unitLogo === logoStardays
                      ? "w-28 sm:w-32 lg:w-40"
                      : "w-36 sm:w-44 lg:w-60",
                  )}
                />
              </div>
            )}

            <div className="flex flex-wrap items-end gap-3">
              <h2 className="break-keep text-4xl font-black leading-[1.04] tracking-normal drop-shadow-[0_8px_22px_rgba(0,0,0,0.42)] sm:whitespace-nowrap sm:text-5xl lg:text-7xl xl:text-[4.8rem]">
                {member.name}
              </h2>
            </div>

            {activeImage && (
              <div className="relative mt-3 h-[clamp(220px,36dvh,300px)] min-h-56 w-full overflow-hidden rounded-xl border border-white/12 bg-slate-950/30 shadow-md shadow-black/15 sm:hidden">
                <img
                  src={activeImage.imageUrl}
                  alt={activeImage.alt ?? `${member.name} 프로필 이미지`}
                  className="size-full object-cover object-[50%_18%]"
                />
                {hasMultipleImages && (
                  <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/12 bg-slate-950/44 px-2.5 py-1.5 backdrop-blur-md">
                    {profileImages.map((image, index) => (
                      <button
                        key={`${image.imageUrl}-mobile-dot-${index}`}
                        type="button"
                        className={cn(
                          "size-2 rounded-full transition",
                          activeImageIndex === index
                            ? "bg-white"
                            : "bg-white/36 hover:bg-white/64",
                        )}
                        onClick={() => goToImage(index)}
                        aria-label={`${index + 1}번째 프로필 이미지 보기`}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {hasProfileMeta && (
              <div className="mt-3 w-full max-w-[560px] rounded-xl border border-white/14 bg-slate-950/56 p-3 shadow-lg shadow-black/20 backdrop-blur-md sm:mt-5 sm:p-5 sm:shadow-2xl sm:shadow-black/25 lg:mt-6 lg:max-w-[760px] lg:bg-slate-950/36">
                {hasInfoCapsules && (
                  <div className="grid grid-cols-1 gap-2 sm:gap-2.5 sm:grid-cols-[1.25fr_1fr_1.08fr] lg:grid-cols-[1.72fr_0.82fr_1.04fr]">
                    {(member.fan_name || member.oshi_mark) && (
                      <ProfileInfoCapsule icon={Heart} label="팬덤명">
                        {member.fan_name && (
                          <span className="min-w-0 truncate sm:break-keep sm:overflow-visible sm:text-clip sm:whitespace-nowrap">
                            {member.fan_name}
                          </span>
                        )}
                        {member.oshi_mark && (
                          <span className="shrink-0 whitespace-nowrap text-sm leading-none sm:text-xl">
                            {member.oshi_mark}
                          </span>
                        )}
                      </ProfileInfoCapsule>
                    )}
                    {birthDate && (
                      <ProfileInfoCapsule icon={Cake} label="생일">
                        <span className="min-w-0 truncate tabular-nums">
                          {birthDate}
                        </span>
                      </ProfileInfoCapsule>
                    )}
                    {debutDate && (
                      <ProfileInfoCapsule icon={Sparkles} label="데뷔">
                        <span className="min-w-0 truncate tabular-nums">
                          {debutDate}
                        </span>
                      </ProfileInfoCapsule>
                    )}
                  </div>
                )}

                {member.introduction && (
                  <>
                    {hasInfoCapsules && (
                      <div className="my-2 h-px w-full bg-white/12 sm:my-4" />
                    )}
                    <div>
                      <p className="text-xs font-bold text-[var(--member-accent)] sm:text-base">
                        자기소개
                      </p>
                      <p className="mt-1 max-h-10 overflow-hidden break-keep text-xs font-medium leading-5 text-white/84 sm:mt-2 sm:max-h-none sm:overflow-visible sm:text-base sm:leading-7 lg:text-lg lg:leading-8">
                        {member.introduction}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {secondaryLinks.length > 0 && (
              <div className="mt-6 hidden flex-wrap gap-2 sm:flex lg:hidden">
                {secondaryLinks.map((link) => (
                  <Badge
                    key={`${link.type}-${link.url}-badge`}
                    className="rounded-lg border-white/18 bg-white/12 px-3 py-1 text-white hover:bg-white/12"
                  >
                    {link.label || linkMeta[link.type].label}
                  </Badge>
                ))}
              </div>
            )}
          </motion.div>
        </section>

        {(primaryLinks.length > 0 || secondaryLinks.length > 0) && (
          <motion.aside
            className="mt-3 grid grid-cols-1 gap-2 sm:mt-6 sm:grid-cols-2 lg:absolute lg:bottom-10 lg:right-8 lg:mt-0 lg:flex lg:w-[316px] lg:flex-col lg:justify-end lg:gap-3"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, ease: "easeOut", delay: 0.08 }}
            aria-label="멤버 링크"
          >
            {primaryLinks.map((link) => (
              <ProfileLinkButton key={`${link.type}-${link.url}`} link={link} />
            ))}
            {secondaryLinks.map((link) => (
              <ProfileLinkButton
                key={`${link.type}-${link.url}`}
                link={link}
                secondary
              />
            ))}
          </motion.aside>
        )}
        <div className="h-16 shrink-0 sm:hidden" aria-hidden="true" />
      </div>

      {showImageControls && (
        <div className="absolute bottom-8 left-1/2 z-20 hidden -translate-x-1/2 items-center gap-4 rounded-full border border-white/12 bg-slate-950/46 px-5 py-3 shadow-2xl shadow-black/30 backdrop-blur-xl lg:flex">
          <button
            type="button"
            className="grid size-8 place-items-center rounded-full text-white transition hover:bg-white/14"
            onClick={() => goToImage(activeImageIndex - 1)}
            aria-label="이전 프로필 이미지"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
          <span className="min-w-16 text-center text-lg font-black tabular-nums tracking-wide">
            {activeImageIndex + 1} / {profileImages.length}
          </span>
          <button
            type="button"
            className="grid size-8 place-items-center rounded-full text-white transition hover:bg-white/14"
            onClick={() => goToImage(activeImageIndex + 1)}
            aria-label="다음 프로필 이미지"
          >
            <ChevronRight className="size-5" aria-hidden="true" />
          </button>
        </div>
      )}
    </main>
  );
}
