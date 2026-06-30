import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ContentPageShell } from "@/components/content-page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { type Notice } from "@/db/schema";
import type { Member } from "@/lib/types";
import {
  AlertCircle,
  ArrowUpRight,
  CalendarDays,
  ExternalLink,
  Megaphone,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchActiveMembers, fetchMemberProfile } from "@/lib/api/members";
import { fetchNotices } from "@/lib/api/notices";
import { isNoticeVisibleOnDate } from "@/lib/notice-visibility";
import { QUERY_STALE_TIME_MS } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

const noticeTypeConfigs = {
  notice: {
    label: "공지",
    fullLabel: "공지사항",
    badgeClass:
      "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-400/10 dark:text-indigo-200",
    featuredClass:
      "border-indigo-200/80 bg-indigo-50/70 dark:border-indigo-400/20 dark:bg-indigo-400/10",
    thumbnailClass:
      "border-indigo-200/80 bg-[linear-gradient(135deg,rgba(238,242,255,.9),rgba(255,255,255,.95)_48%,rgba(224,231,255,.85))] dark:border-indigo-400/20 dark:bg-indigo-400/10",
    iconClass: "bg-indigo-600 text-white",
  },
  event: {
    label: "이벤트",
    fullLabel: "이벤트",
    badgeClass:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200",
    featuredClass:
      "border-amber-200/80 bg-amber-50/70 dark:border-amber-400/20 dark:bg-amber-400/10",
    thumbnailClass:
      "border-amber-200/80 bg-[linear-gradient(135deg,rgba(254,243,199,.95),rgba(255,255,255,.95)_48%,rgba(255,237,213,.9))] dark:border-amber-400/20 dark:bg-amber-400/10",
    iconClass: "bg-amber-500 text-white",
  },
} as const;

type NoticeTypeKey = keyof typeof noticeTypeConfigs;
type NoticeMemberMap = Map<number, Member>;
type NoticeProfileImageMap = Map<number, string>;

const resolveNoticeType = (value?: string | null): NoticeTypeKey => {
  if (value && value in noticeTypeConfigs) {
    return value as NoticeTypeKey;
  }
  return "notice";
};

const formatDateValue = (value?: number | string | null) => {
  if (value === null || value === undefined || value === "") return null;

  const stringValue = String(value);
  const datePrefix = stringValue.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (datePrefix) return datePrefix.replace(/-/g, ".");

  const date = new Date(stringValue);
  if (Number.isNaN(date.getTime())) return stringValue;

  return date.toISOString().slice(0, 10).replace(/-/g, ".");
};

const formatPeriod = (notice: Notice) => {
  if (!notice.started_at && !notice.ended_at) return "상시 게시";

  return `${formatDateValue(notice.started_at) ?? "..."} ~ ${
    formatDateValue(notice.ended_at) ?? "..."
  }`;
};

const getNoticeSortTime = (notice: Notice) => {
  if (!notice.created_at) return notice.id ?? 0;

  const time = new Date(String(notice.created_at)).getTime();
  return Number.isNaN(time) ? notice.id ?? 0 : time;
};

const sortNoticesByLatest = (notices: Notice[]) =>
  [...notices].sort((a, b) => {
    const timeDiff = getNoticeSortTime(b) - getNoticeSortTime(a);
    if (timeDiff !== 0) return timeDiff;
    return (b.id ?? 0) - (a.id ?? 0);
  });

const getNoticePublisherLabel = (
  notice: Notice,
  memberMap: NoticeMemberMap,
) => {
  if (notice.publisher_type !== "member") return "OTW";
  const member = notice.publisher_member_uid
    ? memberMap.get(notice.publisher_member_uid)
    : null;
  if (!member) return "멤버";
  return `${member.oshi_mark ? `${member.oshi_mark} ` : ""}${member.name}`;
};

const normalizeNoticeThumbnailUrl = (value?: string | null) => {
  const trimmed = value?.trim();
  if (
    !trimmed ||
    trimmed === "thumbnail_url" ||
    trimmed === "null" ||
    trimmed === "undefined"
  ) {
    return null;
  }
  return trimmed;
};

const getNoticeThumbnailImageUrl = (
  notice: Notice,
  profileImageMap: NoticeProfileImageMap,
) => {
  const noticeThumbnailUrl = normalizeNoticeThumbnailUrl(notice.thumbnail_url);
  if (noticeThumbnailUrl) return noticeThumbnailUrl;
  if (notice.publisher_type !== "member" || !notice.publisher_member_uid) {
    return null;
  }
  return profileImageMap.get(notice.publisher_member_uid) ?? null;
};

export const Route = createFileRoute("/notice")({
  component: NoticePage,
});

function NoticePage() {
  const noticesQuery = useQuery<Notice[]>({
    queryKey: queryKeys.notices.public(),
    queryFn: () => fetchNotices(),
    staleTime: QUERY_STALE_TIME_MS,
  });
  const notices = useMemo(() => noticesQuery.data ?? [], [noticesQuery.data]);
  const hasMemberPublisher = useMemo(
    () => notices.some((notice) => notice.publisher_type === "member"),
    [notices],
  );
  const membersQuery = useQuery<Member[]>({
    queryKey: queryKeys.members.active(),
    queryFn: fetchActiveMembers,
    staleTime: QUERY_STALE_TIME_MS,
    enabled: hasMemberPublisher,
  });
  const memberMap = useMemo(
    () => new Map((membersQuery.data ?? []).map((member) => [member.uid, member])),
    [membersQuery.data],
  );
  const publisherMemberUids = useMemo(
    () =>
      Array.from(
        new Set(
          notices
            .map((notice) =>
              notice.publisher_type === "member"
                ? notice.publisher_member_uid
                : null,
            )
            .filter((uid): uid is number => typeof uid === "number" && uid > 0),
        ),
      ).sort((a, b) => a - b),
    [notices],
  );
  const publisherProfilesQuery = useQuery<Array<[number, string]>>({
    queryKey: queryKeys.members.noticePublisherProfiles(
      publisherMemberUids.join(","),
    ),
    queryFn: async () => {
      const membersByUid = new Map(
        (membersQuery.data ?? []).map((member) => [member.uid, member]),
      );
      const profiles = await Promise.all(
        publisherMemberUids.map(async (uid) => {
          const member = membersByUid.get(uid);
          if (!member) return null;
          try {
            const profile = await fetchMemberProfile(member.code);
            const imageUrl = profile.profileImages[0]?.imageUrl;
            return imageUrl ? ([uid, imageUrl] as [number, string]) : null;
          } catch {
            return null;
          }
        }),
      );
      return profiles.filter((item): item is [number, string] => item !== null);
    },
    staleTime: QUERY_STALE_TIME_MS,
    enabled:
      publisherMemberUids.length > 0 && (membersQuery.data?.length ?? 0) > 0,
  });
  const profileImageMap = useMemo(
    () => new Map(publisherProfilesQuery.data ?? []),
    [publisherProfilesQuery.data],
  );

  const activeNotices = useMemo(
    () =>
      sortNoticesByLatest(
        notices.filter((notice) => isNoticeVisibleOnDate(notice)),
      ),
    [notices],
  );
  const featuredNotice = activeNotices[0] ?? null;
  const noticeList = activeNotices.slice(1);

  return (
    <ContentPageShell
      title="공지사항&이벤트"
      leadingIcon={<Megaphone className="h-4.5 w-4.5 text-foreground" />}
      contentClassName="max-w-4xl gap-5"
    >
      {noticesQuery.isLoading ? (
        <NoticePageSkeleton />
      ) : noticesQuery.error ? (
        <NoticeError
          message={
            noticesQuery.error instanceof Error
              ? noticesQuery.error.message
              : "알 수 없는 오류가 발생했습니다."
          }
          onRetry={() => void noticesQuery.refetch()}
        />
      ) : !featuredNotice ? (
        <NoticeEmptyState />
      ) : (
        <>
          <section className="space-y-1">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">
                현재 진행중인 안내 {activeNotices.length}건
              </p>
              <h2 className="mt-1 text-2xl font-semibold leading-tight text-foreground">
                지금 확인할 공지와 이벤트
              </h2>
            </div>
          </section>

          <FeaturedNoticeCard
            notice={featuredNotice}
            memberMap={memberMap}
            profileImageMap={profileImageMap}
          />

          {noticeList.length > 0 ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-foreground">
                  진행중인 전체 안내
                </h2>
                <span className="text-sm font-medium text-muted-foreground">
                  {noticeList.length}건
                </span>
              </div>
              <div className="overflow-hidden rounded-lg border border-border/80 bg-card shadow-sm">
                {noticeList.map((notice) => (
                  <NoticeListItem
                    key={notice.id}
                    notice={notice}
                    memberMap={memberMap}
                    profileImageMap={profileImageMap}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </ContentPageShell>
  );
}

function NoticeTypeBadge({ type }: { type: string }) {
  const config = noticeTypeConfigs[resolveNoticeType(type)];

  return (
    <Badge
      variant="secondary"
      className={cn("h-7 border px-3 font-semibold", config.badgeClass)}
    >
      {config.fullLabel}
    </Badge>
  );
}

function NoticePublisherChip({
  notice,
  memberMap,
  className,
}: {
  notice: Notice;
  memberMap: NoticeMemberMap;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 rounded-md border border-background/70 bg-background/80 px-2 py-1 text-[10px] font-bold text-muted-foreground shadow-xs",
        className,
      )}
    >
      <span className="truncate">{getNoticePublisherLabel(notice, memberMap)}</span>
    </span>
  );
}

function NoticePublisherText({
  notice,
  memberMap,
}: {
  notice: Notice;
  memberMap: NoticeMemberMap;
}) {
  return (
    <span className="inline-flex min-w-0 text-sm font-medium text-muted-foreground">
      <span className="min-w-0 truncate">
        {getNoticePublisherLabel(notice, memberMap)}
      </span>
    </span>
  );
}

function NoticeMeta({
  notice,
  memberMap,
}: {
  notice: Notice;
  memberMap: NoticeMemberMap;
}) {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div className="min-w-0">
        <dt className="mb-1 text-xs font-semibold text-muted-foreground">
          게시자
        </dt>
        <dd className="flex min-w-0 font-medium text-foreground">
          <span className="min-w-0 truncate">
            {getNoticePublisherLabel(notice, memberMap)}
          </span>
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="mb-1 text-xs font-semibold text-muted-foreground">
          진행 기간
        </dt>
        <dd className="flex min-w-0 items-center gap-2 font-medium text-foreground">
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate">{formatPeriod(notice)}</span>
        </dd>
      </div>
    </dl>
  );
}

function NoticeThumbnail({
  notice,
  memberMap,
  profileImageMap,
  variant = "default",
}: {
  notice: Notice;
  memberMap: NoticeMemberMap;
  profileImageMap: NoticeProfileImageMap;
  variant?: "default" | "compact";
}) {
  const config = noticeTypeConfigs[resolveNoticeType(notice.type)];
  const thumbnailImageUrl = getNoticeThumbnailImageUrl(notice, profileImageMap);

  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-lg border shadow-sm",
        config.thumbnailClass,
        variant === "compact"
          ? "flex aspect-[4/3] min-h-24 items-center justify-center sm:h-28 sm:w-36 sm:shrink-0"
          : "flex min-h-48 items-center justify-center sm:min-h-56 lg:min-h-full",
      )}
      aria-hidden="true"
    >
      <div className="absolute inset-x-4 top-4 z-20 h-px bg-foreground/10" />
      {thumbnailImageUrl ? (
        <>
          <img
            src={thumbnailImageUrl}
            alt=""
            className="absolute inset-0 z-0 h-full w-full object-cover"
            draggable={false}
          />
          <div className="absolute inset-0 z-10 bg-gradient-to-t from-background/70 via-background/10 to-transparent" />
        </>
      ) : (
        <img
          src="/logo_otw.svg"
          alt=""
          className={cn(
            "relative z-10 max-w-[70%] opacity-90 drop-shadow-sm",
            variant === "compact" ? "max-h-10" : "max-h-20",
          )}
          draggable={false}
        />
      )}
      <div className="absolute inset-x-4 bottom-4 z-20 flex min-w-0 justify-start">
        <NoticePublisherChip notice={notice} memberMap={memberMap} />
      </div>
    </div>
  );
}

function FeaturedNoticeCard({
  notice,
  memberMap,
  profileImageMap,
}: {
  notice: Notice;
  memberMap: NoticeMemberMap;
  profileImageMap: NoticeProfileImageMap;
}) {
  const config = noticeTypeConfigs[resolveNoticeType(notice.type)];

  return (
    <article
      className={cn(
        "overflow-hidden rounded-lg border bg-card shadow-sm",
        config.featuredClass,
      )}
    >
      <div className="grid min-h-[300px] lg:grid-cols-[19rem_minmax(0,1fr)]">
        <NoticeThumbnail
          notice={notice}
          memberMap={memberMap}
          profileImageMap={profileImageMap}
        />

        <div className="flex min-w-0 flex-col justify-between gap-8 p-5 sm:p-6 lg:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg",
                config.iconClass,
              )}
              aria-hidden="true"
            >
              <Megaphone className="h-4.5 w-4.5" />
            </span>
            <NoticeTypeBadge type={notice.type} />
          </div>

          <div className="min-w-0 space-y-5">
            <p className="max-w-4xl whitespace-pre-wrap text-2xl font-semibold leading-relaxed text-foreground sm:text-3xl">
              {notice.content}
            </p>
            <NoticeMeta notice={notice} memberMap={memberMap} />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {notice.url ? (
              <Button asChild className="w-full justify-between sm:w-auto">
                <a
                  href={notice.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={notice.url}
                  aria-label={`${config.fullLabel} 자세히 보기`}
                >
                  자세히 보기
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              </Button>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-background/70 px-3 py-2 text-sm font-medium text-muted-foreground">
                <ExternalLink className="h-4 w-4 shrink-0" />
                상세 링크 준비중
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function NoticeListItem({
  notice,
  memberMap,
  profileImageMap,
}: {
  notice: Notice;
  memberMap: NoticeMemberMap;
  profileImageMap: NoticeProfileImageMap;
}) {
  return (
    <article className="grid gap-4 border-b border-border/70 p-4 last:border-b-0 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center sm:p-5">
      <NoticeThumbnail
        notice={notice}
        memberMap={memberMap}
        profileImageMap={profileImageMap}
        variant="compact"
      />

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <NoticeTypeBadge type={notice.type} />
          <NoticePublisherText notice={notice} memberMap={memberMap} />
          <span className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <CalendarDays className="h-4 w-4 shrink-0" />
            {formatPeriod(notice)}
          </span>
        </div>
        <p className="whitespace-pre-wrap text-base font-semibold leading-relaxed text-foreground sm:text-lg">
          {notice.content}
        </p>
      </div>

      {notice.url ? (
        <Button variant="outline" size="sm" asChild>
          <a
            href={notice.url}
            target="_blank"
            rel="noopener noreferrer"
            title={notice.url}
            aria-label="공지 링크 열기"
          >
            자세히 보기
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      ) : null}
    </article>
  );
}

function NoticePageSkeleton() {
  return (
    <div className="space-y-5" aria-label="공지사항 로딩 중">
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="grid overflow-hidden rounded-lg border border-border/80 bg-card shadow-sm lg:grid-cols-[19rem_minmax(0,1fr)]">
        <Skeleton className="min-h-48 rounded-none lg:min-h-[300px]" />
        <div className="p-5 sm:p-6 lg:p-7">
          <div className="mb-10 flex items-center gap-2">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-7 w-24 rounded-full" />
          </div>
          <Skeleton className="h-8 w-full max-w-3xl" />
          <Skeleton className="mt-3 h-8 w-4/5 max-w-2xl" />
          <Skeleton className="mt-8 h-10 w-32" />
        </div>
      </div>
      <div className="rounded-lg border border-border/80 bg-card p-4 shadow-sm">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="mt-4 h-6 w-3/4" />
      </div>
    </div>
  );
}

function NoticeError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-destructive shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
        <p className="min-w-0 text-sm font-medium">{message}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={onRetry}
      >
        <RefreshCw className="h-4 w-4" />
        다시 불러오기
      </Button>
    </div>
  );
}

function NoticeEmptyState() {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/80 bg-muted/20 px-6 py-14 text-center shadow-sm">
      <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground shadow-sm">
        <Megaphone className="h-7 w-7" />
      </div>
      <p className="text-base font-semibold text-foreground">
        표시할 공지사항이 없습니다.
      </p>
      <p className="text-sm text-muted-foreground">
        새로운 소식이 등록되면 이곳에 표시됩니다.
      </p>
    </div>
  );
}
