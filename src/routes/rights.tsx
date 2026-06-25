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
  Mail,
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

type PolicyRow = {
  title: string;
  description: string;
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
    title: "개인정보 최소 처리",
    description:
      "OTW Schedule +는 확장 기능 제공에 필요한 로컬 설정과 선택된 CHZZK 화면 정보만 처리합니다.",
    icon: ShieldCheck,
  },
];

const contentNotices = [
  "All profile images, names, schedules, video, clip, live, and social post content belong to the respective creators, streamers, agencies, and rights holders.",
  "이 사이트는 일정 확인을 돕기 위한 비공식 팬 운영 사이트이며, 오버더월 또는 각 소속사/플랫폼을 대표하지 않습니다.",
  "권리자가 콘텐츠의 수정, 삭제, 출처 정정 등을 요청하는 경우 문의 메일 또는 GitHub 이슈로 연락해 주세요.",
];

const privacyPrinciples: PolicyRow[] = [
  {
    title: "단일 목적",
    description:
      "OTW Schedule +는 오버더월 스케줄표의 멀티뷰 화면에서 CHZZK 방송 시청을 보조하기 위한 확장 프로그램입니다.",
  },
  {
    title: "서버 전송 없음",
    description:
      "Naver 또는 CHZZK 로그인 쿠키 값은 OTW 서버, Worker, 웹앱 로그, 외부 분석 도구로 전송되지 않습니다.",
  },
  {
    title: "선택 기능",
    description:
      "멀티뷰 채팅 로그인 연동은 기본적으로 꺼져 있으며, 사용자가 직접 켠 경우에만 선택 권한을 요청합니다.",
  },
  {
    title: "로그아웃 방지",
    description:
      "채팅 로그인 연동을 끄더라도 실제 CHZZK 또는 Naver 사이트의 로그인 상태를 해제하지 않습니다.",
  },
];

const handledDataRows: PolicyRow[] = [
  {
    title: "로컬 확장 설정",
    description:
      "화면 자동 정리, 채팅 로그인 연동 사용 여부 같은 사용자 설정을 Chrome storage에 저장합니다.",
  },
  {
    title: "CHZZK 화면 식별 정보",
    description:
      "선택된 멀티뷰 타일과 CHZZK iframe을 맞추기 위해 frame 식별자, URL, channel ID를 처리합니다.",
  },
  {
    title: "Naver 로그인 쿠키",
    description:
      "사용자가 채팅 로그인 연동을 켠 경우에만 Chrome cookies API로 NID_AUT, NID_SES 쿠키를 브라우저 안에서 처리합니다.",
  },
];

const notCollectedRows: PolicyRow[] = [
  {
    title: "인증 정보 외부 전송",
    description:
      "Naver 또는 CHZZK 쿠키 값, 세션 토큰, 개인 인증 정보는 OTW 서버로 보내지 않습니다.",
  },
  {
    title: "브라우징 기록",
    description:
      "사용자의 전체 방문 기록, 검색 기록, 타 사이트 이용 내역을 수집하지 않습니다.",
  },
  {
    title: "광고 및 판매 목적 이용",
    description:
      "사용자 데이터를 판매하거나 개인화 광고, 추적, 신용 평가, 보험, 대출 판단 목적으로 사용하지 않습니다.",
  },
];

const permissionRows: PolicyRow[] = [
  {
    title: "storage",
    description:
      "확장 프로그램의 사용자 설정을 로컬 브라우저에 저장하기 위해 사용합니다. 민감한 인증 정보는 storage에 저장하지 않습니다.",
  },
  {
    title: "cookies 선택 권한",
    description:
      "채팅 로그인 연동을 사용자가 직접 켠 경우에만 요청합니다. CHZZK 채팅 iframe이 기존 브라우저 로그인 상태를 인식하도록 돕기 위한 선택 권한입니다.",
  },
  {
    title: "https://chzzk.naver.com/*",
    description:
      "선택된 CHZZK 플레이어 안에서 넓은 화면 전환과 플레이어 내부 채팅 숨김을 시도하고, live/chat iframe을 식별하기 위해 사용합니다.",
  },
  {
    title: "https://otw-schedule.info/*",
    description:
      "오버더월 멀티뷰 페이지와 확장이 연결 상태와 선택 채널 정보를 주고받기 위해 사용합니다. 쿠키 값은 전달하지 않습니다.",
  },
  {
    title: "https://nid.naver.com/* 선택 권한",
    description:
      "채팅 로그인 연동을 켠 경우 Naver 로그인 쿠키 상태를 확인하기 위해 사용합니다. 기본 설치 시에는 요청하지 않습니다.",
  },
];

const limitedUseRows: PolicyRow[] = [
  {
    title: "제한적 사용",
    description:
      "Chrome extension API로 받은 정보는 공개된 기능 제공과 개선에 필요한 범위에서만 사용합니다.",
  },
  {
    title: "원격 코드 미사용",
    description:
      "확장 프로그램의 JavaScript, CSS, 이미지 에셋은 패키지에 포함되어 있으며 원격 실행 코드를 내려받아 실행하지 않습니다.",
  },
  {
    title: "사람에 의한 열람 없음",
    description:
      "확장이 로컬에서 처리하는 로그인 쿠키 값은 OTW 운영자가 열람하거나 저장할 수 없습니다.",
  },
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
          <div className="min-w-0 space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
                <Scale className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                  Rights and privacy notice
                </p>
                <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                  권리 고지 및 개인정보 처리방침
                </h1>
              </div>
            </div>
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground md:text-base">
              이 페이지는 오버더월 스케줄표의 콘텐츠 권리 고지와 Chrome 확장
              프로그램 OTW Schedule +의 개인정보 처리방침을 안내합니다.
            </p>
            <p className="text-xs text-muted-foreground">
              시행일 및 최종 업데이트: 2026년 6월 25일
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
          aria-labelledby="privacy-title"
          className="space-y-4 border-t border-border/70 pt-6"
        >
          <SectionTitle
            id="privacy-title"
            icon={ShieldCheck}
            title="OTW Schedule + 개인정보 처리방침"
          />
          <div className="rounded-md border border-border/70 bg-muted/20 p-4 text-sm leading-relaxed text-muted-foreground md:text-base">
            OTW Schedule +는 오버더월 스케줄표의 멀티뷰 화면에서 CHZZK 방송
            시청을 보조하기 위한 Chrome 확장 프로그램입니다. 현재 버전은 선택된
            CHZZK 플레이어의 넓은 화면 전환, 플레이어 내부 채팅 숨김, 사용자가
            명시적으로 켠 경우의 멀티뷰 채팅 로그인 연동을 제공합니다.
          </div>
          <PolicyGrid rows={privacyPrinciples} />
        </section>

        <PolicySection
          id="handled-data"
          icon={FileText}
          title="처리하는 정보"
          rows={handledDataRows}
        />
        <PolicySection
          id="not-collected"
          icon={Shield}
          title="수집하거나 전송하지 않는 정보"
          rows={notCollectedRows}
        />
        <PolicySection
          id="permissions"
          icon={ShieldCheck}
          title="확장 권한 사용 목적"
          rows={permissionRows}
        />
        <PolicySection
          id="limited-use"
          icon={Info}
          title="Chrome Web Store Limited Use 안내"
          rows={limitedUseRows}
        />

        <section
          aria-labelledby="contact-title"
          className="space-y-3 border-t border-border/70 pt-6"
        >
          <SectionTitle id="contact-title" icon={Mail} title="문의 및 요청" />
          <div className="grid gap-3 md:grid-cols-2">
            <ContactLink
              href="mailto:397love@gmail.com"
              title="문의 메일"
              description="개인정보, 권리 고지, 삭제 요청은 메일로 문의할 수 있습니다."
            />
            <ContactLink
              href="https://github.com/rlatmfrl24/overthewall-schedule/issues"
              title="GitHub 이슈"
              description="버그 신고, 기능 요청, 정책 문구 정정 요청을 남길 수 있습니다."
            />
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

function PolicyGrid({ rows }: { rows: PolicyRow[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map((row) => (
        <article
          key={row.title}
          className="rounded-md border border-border/70 bg-background p-4"
        >
          <h3 className="text-sm font-semibold">{row.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {row.description}
          </p>
        </article>
      ))}
    </div>
  );
}

type PolicySectionProps = {
  id: string;
  title: string;
  rows: PolicyRow[];
  icon: LucideIcon;
};

function PolicySection({ id, title, rows, icon }: PolicySectionProps) {
  return (
    <section
      aria-labelledby={id}
      className="space-y-3 border-t border-border/70 pt-6"
    >
      <SectionTitle id={id} icon={icon} title={title} />
      <div className="divide-y divide-border/60 rounded-md border border-border/70">
        {rows.map((row) => (
          <article
            key={row.title}
            className="grid gap-2 px-4 py-4 md:grid-cols-[13rem_1fr] md:gap-4"
          >
            <h3 className="text-sm font-semibold text-foreground">
              {row.title}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground md:text-base">
              {row.description}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ContactLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      className="group rounded-md border border-border/70 bg-muted/20 p-4 transition-colors hover:bg-muted/35"
    >
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
        {title}
        <ExternalLink className="size-3.5 opacity-70 transition-transform group-hover:translate-x-0.5" />
      </span>
      <span className="mt-2 block text-sm leading-relaxed text-muted-foreground">
        {description}
      </span>
    </a>
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
