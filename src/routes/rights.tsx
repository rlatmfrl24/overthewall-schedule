import { Button } from "@/components/ui/button";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  AtSign,
  Cloud,
  ExternalLink,
  FileText,
  Github,
  Info,
  Radio,
  Scale,
  Shield,
  ShieldCheck,
  Users,
  Youtube,
  type LucideIcon,
} from "lucide-react";

type SummaryItem = {
  title: string;
  description: string;
  icon: LucideIcon;
};

type RightsNotice = {
  name: string;
  notice: string;
  href: string;
  icon: LucideIcon;
};

const iconBoxClassName =
  "flex size-9 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background text-muted-foreground";

const iconClassName = "size-4 shrink-0";

const summaryItems: SummaryItem[] = [
  {
    title: "비공식 팬 운영",
    description:
      "오버더월 또는 각 소속사/플랫폼을 대표하지 않는 팬 운영 사이트입니다.",
    icon: Info,
  },
  {
    title: "콘텐츠 권리 귀속",
    description:
      "프로필, 일정, 영상, 클립, 라이브, 게시글 권리는 각 권리자에게 있습니다.",
    icon: Users,
  },
  {
    title: "수정 및 삭제 요청",
    description:
      "권리자의 정정, 삭제, 출처 수정 요청은 푸터의 문의 채널로 접수합니다.",
    icon: ShieldCheck,
  },
];

const contentNotices = [
  "All profile images, names, schedules, video, clip, live, and social post content belong to the respective creators, streamers, agencies, and rights holders.",
  "이 사이트는 일정 확인을 돕기 위한 비공식 팬 운영 사이트이며, 오버더월 또는 각 소속사/플랫폼을 대표하지 않습니다.",
  "권리자가 콘텐츠의 수정, 삭제, 출처 정정 등을 요청하는 경우 푸터의 문의 메일 또는 GitHub 이슈로 연락해 주세요.",
];

const platformNotices: RightsNotice[] = [
  {
    name: "Chzzk / NAVER Cafe",
    notice:
      "Chzzk and NAVER Cafe are trademarks or registered trademarks of NAVER Corp. Chzzk © NAVER Corp.",
    href: "https://chzzk.naver.com/",
    icon: Radio,
  },
  {
    name: "YouTube / YouTube Shorts",
    notice:
      "YouTube and YouTube Shorts are trademarks or registered trademarks of Google LLC. YouTube © Google LLC.",
    href: "https://www.youtube.com/",
    icon: Youtube,
  },
  {
    name: "X",
    notice:
      "X is a trademark or registered trademark of X Corp. X © X Corp.",
    href: "https://x.com/",
    icon: AtSign,
  },
];

const serviceNotices: RightsNotice[] = [
  {
    name: "Clerk",
    notice:
      "Clerk is a trademark or registered trademark of Clerk, Inc. Clerk © Clerk, Inc.",
    href: "https://clerk.com/",
    icon: Shield,
  },
  {
    name: "Cloudflare",
    notice:
      "Cloudflare is a trademark or registered trademark of Cloudflare, Inc. Cloudflare © Cloudflare, Inc.",
    href: "https://www.cloudflare.com/",
    icon: Cloud,
  },
  {
    name: "GitHub",
    notice:
      "GitHub is a trademark or registered trademark of GitHub, Inc. GitHub © GitHub, Inc.",
    href: "https://github.com/",
    icon: Github,
  },
];

export const Route = createFileRoute("/rights")({
  component: RightsPage,
});

function RightsPage() {
  const router = useRouter();

  return (
    <main className="w-full flex-1 overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6 md:px-6 md:py-10">
        <header className="flex items-start gap-3 md:gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="size-10 shrink-0 rounded-md border border-border/60 text-muted-foreground hover:text-foreground"
            onClick={() => {
              router.history.back();
            }}
            aria-label="이전 페이지로 돌아가기"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
                <Scale className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                  Rights notice
                </p>
                <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                  권리 고지
                </h1>
              </div>
            </div>
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground md:text-base">
              이 페이지는 사이트에서 참조하거나 연동하는 콘텐츠, 플랫폼,
              운영 서비스의 권리 귀속을 안내합니다.
            </p>
          </div>
        </header>

        <section aria-labelledby="rights-summary-title" className="space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <h2 id="rights-summary-title" className="text-base font-semibold">
              핵심 고지
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {summaryItems.map((item) => (
              <SummaryNotice key={item.title} item={item} />
            ))}
          </div>
        </section>

        <section
          aria-labelledby="content-rights-title"
          className="space-y-3 border-t border-border/70 pt-6"
        >
          <SectionTitle
            id="content-rights-title"
            icon={FileText}
            title="콘텐츠 및 비공식 운영 고지"
          />
          <div className="divide-y divide-border/60 rounded-md border border-border/70">
            {contentNotices.map((notice) => (
              <p
                key={notice}
                className="px-4 py-3 text-sm leading-relaxed text-muted-foreground md:text-base"
              >
                {notice}
              </p>
            ))}
          </div>
        </section>

        <NoticeSection
          id="platform-rights"
          title="플랫폼 및 상표 권리"
          notices={platformNotices}
          icon={Scale}
        />
        <NoticeSection
          id="service-rights"
          title="운영 서비스 권리"
          notices={serviceNotices}
          icon={ShieldCheck}
        />
      </div>
    </main>
  );
}

function SummaryNotice({ item }: { item: SummaryItem }) {
  const Icon = item.icon;

  return (
    <article className="flex min-w-0 gap-3 rounded-md border border-border/70 bg-muted/20 p-4">
      <span className={iconBoxClassName}>
        <Icon className={iconClassName} />
      </span>
      <div className="min-w-0 space-y-1">
        <h3 className="text-sm font-semibold">{item.title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {item.description}
        </p>
      </div>
    </article>
  );
}

type SectionTitleProps = {
  id: string;
  title: string;
  icon: LucideIcon;
};

function SectionTitle({ id, title, icon: Icon }: SectionTitleProps) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <h2 id={id} className="text-base font-semibold md:text-lg">
        {title}
      </h2>
    </div>
  );
}

type NoticeSectionProps = {
  id: string;
  title: string;
  notices: RightsNotice[];
  icon: LucideIcon;
};

function NoticeSection({ id, title, notices, icon }: NoticeSectionProps) {
  return (
    <section
      aria-labelledby={id}
      className="space-y-3 border-t border-border/70 pt-6"
    >
      <SectionTitle id={id} icon={icon} title={title} />
      <div className="divide-y divide-border/60 rounded-md border border-border/70">
        {notices.map((item) => (
          <NoticeRow key={item.name} item={item} />
        ))}
      </div>
    </section>
  );
}

function NoticeRow({ item }: { item: RightsNotice }) {
  const Icon = item.icon;

  return (
    <article className="grid gap-3 px-4 py-4 md:grid-cols-[16rem_1fr] md:items-start">
      <div className="flex min-w-0 items-center gap-3">
        <span className={iconBoxClassName}>
          <Icon className={iconClassName} />
        </span>
        <a
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold leading-snug text-foreground hover:text-muted-foreground"
        >
          <span className="min-w-0 break-words">{item.name}</span>
          <ExternalLink className="size-3.5 shrink-0" />
        </a>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground md:text-base">
        {item.notice}
      </p>
    </article>
  );
}
