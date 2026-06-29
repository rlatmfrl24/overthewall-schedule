import { type ReactNode, useMemo, useState } from "react";
import {
  AlertCircle,
  Coffee,
  MessageSquareText,
  RefreshCw,
  Twitter,
} from "lucide-react";
import { ContentPageShell } from "@/components/content-page-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemberPosts } from "@/hooks/use-member-posts";
import { useScheduleData } from "@/hooks/use-schedule-data";
import { getMembersWithXHandles } from "@/lib/api/x";
import type { UnifiedMemberPost } from "@/lib/api/member-posts";
import type { Member } from "@/lib/types";
import { cn, getContrastColor } from "@/lib/utils";
import { NaverCafePostCard } from "@/features/naver-cafe/naver-cafe-post-card";
import { XPostCard } from "@/features/x/x-post-card";

type MemberPostSource = {
  member: Member;
  xCount: number;
  cafeCount: number;
};

type MemberPostsOverviewProps = {
  loadX: boolean;
  loadCafe: boolean;
};

const formatUpdatedAt = (value: string | null) => {
  if (!value) return "아직 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "확인 불가";

  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (diffMinutes < 1) return "방금 전";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;

  return date.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatGroupDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { key: "unknown", label: "날짜 없음", subLabel: "" };
  }

  const today = new Date();
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const startOfDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const diffDays = Math.floor(
    (startOfToday.getTime() - startOfDate.getTime()) / 86_400_000,
  );
  const label =
    diffDays === 0 ? "오늘" : diffDays === 1 ? "어제" : `${diffDays}일 전`;
  const subLabel = date.toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });

  return { key: startOfDate.toISOString(), label, subLabel };
};

const formatPostTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const groupPostsByDate = (posts: UnifiedMemberPost[]) => {
  const groups = new Map<
    string,
    { label: string; subLabel: string; posts: UnifiedMemberPost[] }
  >();

  for (const post of posts) {
    const dateInfo = formatGroupDate(post.createdAt);
    const group = groups.get(dateInfo.key);
    if (group) {
      group.posts.push(post);
    } else {
      groups.set(dateInfo.key, {
        label: dateInfo.label,
        subLabel: dateInfo.subLabel,
        posts: [post],
      });
    }
  }

  return Array.from(groups.values());
};

const filterUnifiedPostsByMember = (
  posts: UnifiedMemberPost[],
  selectedMemberUids: number[] | null,
) => {
  if (!selectedMemberUids || selectedMemberUids.length === 0) return posts;
  const uidSet = new Set(selectedMemberUids);
  return posts.filter(
    (post) => post.memberUid !== null && uidSet.has(post.memberUid),
  );
};

const MEMBER_POST_FEED_WIDTH_CLASS = "w-full max-w-[1040px]";

const MemberPostsSkeleton = () => (
  <div className="flex w-full flex-col gap-4">
    {Array.from({ length: 4 }).map((_, index) => (
      <div
        key={index}
        className="flex flex-col gap-4 rounded-lg border border-border/70 bg-card p-4 shadow-sm sm:p-5"
      >
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-36" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-5 w-5/6" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <Skeleton className="aspect-video w-full rounded-lg" />
      </div>
    ))}
  </div>
);

const MemberPostFilterBar = ({
  items,
  selectedUids,
  onChange,
  layout = "wrap",
}: {
  items: MemberPostSource[];
  selectedUids: number[] | null;
  onChange: (value: number[] | null) => void;
  layout?: "wrap" | "vertical";
}) => {
  const selectedList = selectedUids ?? [];
  const isAllSelected = selectedList.length === 0;
  const isVertical = layout === "vertical";

  return (
    <div
      className={cn(
        "flex gap-2 px-px py-1",
        isVertical ? "flex-col overflow-visible" : "flex-wrap",
      )}
    >
      <button
        type="button"
        aria-pressed={isAllSelected}
        onClick={() => onChange(null)}
        className={cn(
          "relative inline-flex shrink-0 items-center gap-2 overflow-hidden border text-sm font-medium",
          isVertical
            ? "h-10 w-full justify-start rounded-md px-3 transition-colors"
            : "rounded-full border-2 px-3 py-1.5 transition-all duration-200 ease-out hover:scale-105",
          isVertical
            ? isAllSelected
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-background text-muted-foreground hover:text-foreground"
            : isAllSelected
              ? "border-primary bg-primary text-primary-foreground shadow-sm"
              : "border-border bg-transparent text-muted-foreground hover:border-primary/50",
        )}
      >
        전체
      </button>
      {items.map(({ member }) => {
        const selected = selectedList.includes(member.uid);
        const accentColor = member.main_color || "#111111";
        const textColor = selected
          ? getContrastColor(accentColor)
          : accentColor;

        return (
          <button
            key={member.uid}
            type="button"
            aria-label={member.name}
            aria-pressed={selected}
            onClick={() => onChange([member.uid])}
            style={
              isVertical && selected
                ? {
                    borderColor: accentColor,
                    boxShadow: `0 0 0 1px ${accentColor}`,
                  }
                : isVertical
                  ? undefined
                  : {
                      backgroundColor: selected ? accentColor : "transparent",
                      borderColor: accentColor,
                      color: textColor,
                    }
            }
            className={cn(
              "relative inline-flex shrink-0 items-center gap-2 overflow-hidden border px-3 text-sm font-medium",
              isVertical
                ? "h-10 w-full justify-start rounded-md bg-background transition-colors"
                : "rounded-full border-2 py-1.5 transition-all duration-200 ease-out hover:scale-105",
              isVertical
                ? selected
                  ? "text-foreground shadow-sm"
                  : isAllSelected
                    ? "border-border text-muted-foreground hover:text-foreground"
                    : "border-border text-muted-foreground/60 opacity-60 hover:text-foreground hover:opacity-100"
                : selected && "shadow-sm",
            )}
          >
            {member.oshi_mark ? (
              <span className="text-base leading-none" aria-hidden="true">
                {member.oshi_mark}
              </span>
            ) : (
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: accentColor }}
              />
            )}
            <span className="truncate">{member.name}</span>
          </button>
        );
      })}
    </div>
  );
};

const SourceUpdateBadge = ({
  icon,
  label,
  updatedAt,
  loading,
}: {
  icon: ReactNode;
  label: string;
  updatedAt: string | null;
  loading: boolean;
}) => {
  const value = loading ? "불러오는 중" : formatUpdatedAt(updatedAt);

  return (
    <div
      aria-label={`${label} 마지막 업데이트 ${value}`}
      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/70 bg-background px-2.5 text-xs text-muted-foreground"
    >
      {icon}
      <span className="font-medium text-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
};

const MemberPostContentLayout = ({
  filterItems,
  selectedUids,
  onFilterChange,
  children,
}: {
  filterItems: MemberPostSource[];
  selectedUids: number[] | null;
  onFilterChange: (value: number[] | null) => void;
  children: ReactNode;
}) => {
  const hasFilters = filterItems.length > 0;

  return (
    <div
      data-testid="member-post-content-layout"
      className={cn(
        "mx-auto w-full min-w-0",
        hasFilters
          ? "grid max-w-[1320px] gap-5 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)]"
          : MEMBER_POST_FEED_WIDTH_CLASS,
      )}
    >
      {hasFilters ? (
        <aside
          data-testid="member-post-filter-sidebar"
          className="hidden min-w-0 lg:block"
        >
          <div className="sticky top-5 rounded-lg border border-border/70 bg-card/80 p-2 shadow-sm">
            <MemberPostFilterBar
              items={filterItems}
              selectedUids={selectedUids}
              onChange={onFilterChange}
              layout="vertical"
            />
          </div>
        </aside>
      ) : null}
      <div className="min-w-0">{children}</div>
    </div>
  );
};

const combineErrors = (...errors: Array<string | null>) => {
  const messages = errors.filter((error): error is string => Boolean(error));
  if (messages.length === 0) return null;
  return messages.join(" ");
};

export const MemberPostsOverview = ({
  loadX,
  loadCafe,
}: MemberPostsOverviewProps) => {
  const [selectedMemberUids, setSelectedMemberUids] = useState<number[] | null>(
    null,
  );
  const {
    members,
    loading: membersLoading,
    hasLoaded: membersLoaded,
  } = useScheduleData();

  const membersWithXHandles = useMemo(
    () => (loadX ? getMembersWithXHandles(members) : []),
    [loadX, members],
  );
  const membersWithX = useMemo(
    () => membersWithXHandles.map(({ member }) => member),
    [membersWithXHandles],
  );
  const memberMap = useMemo(
    () => new Map(members.map((member) => [member.uid, member])),
    [members],
  );

  const memberPostsState = useMemberPosts({
    includeX: loadX,
    includeNaverCafe: loadCafe,
    maxResults: 10,
    size: 10,
  });
  const xState = memberPostsState.x;
  const cafeState = memberPostsState.naverCafe;

  const cafeSourceCount = cafeState.sources.filter(
    (source) => source.enabled,
  ).length;
  const memberSources = useMemo(() => {
    const byUid = new Map<number, { xCount: number; cafeCount: number }>();
    for (const { member } of membersWithXHandles) {
      const current = byUid.get(member.uid) ?? { xCount: 0, cafeCount: 0 };
      current.xCount += 1;
      byUid.set(member.uid, current);
    }
    for (const source of cafeState.sources) {
      if (!source.memberUid || !source.enabled) continue;
      const current = byUid.get(source.memberUid) ?? {
        xCount: 0,
        cafeCount: 0,
      };
      current.cafeCount += 1;
      byUid.set(source.memberUid, current);
    }

    return Array.from(byUid.entries())
      .map(([memberUid, counts]) => {
        const member = memberMap.get(memberUid);
        return member ? { member, ...counts } : null;
      })
      .filter((item): item is MemberPostSource => item !== null)
      .sort((a, b) => a.member.uid - b.member.uid);
  }, [cafeState.sources, memberMap, membersWithXHandles]);

  const unifiedPosts = memberPostsState.posts;
  const filteredPosts = useMemo(
    () => filterUnifiedPostsByMember(unifiedPosts, selectedMemberUids),
    [selectedMemberUids, unifiedPosts],
  );
  const timelinePosts = useMemo(
    () =>
      [...filteredPosts].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [filteredPosts],
  );
  const timelineGroups = useMemo(
    () => groupPostsByDate(timelinePosts),
    [timelinePosts],
  );

  const error = combineErrors(xState.error, cafeState.error);
  const hasXSource = membersWithX.length > 0;
  const hasCafeSource = cafeSourceCount > 0;
  const hasAnySource = hasXSource || hasCafeSource;
  const xLoading = loadX && !xState.hasLoaded && hasXSource;
  const cafeLoading = loadCafe && !cafeState.hasLoaded;
  const postsLoading = memberPostsState.loading;
  const showInitialLoading =
    membersLoading ||
    !membersLoaded ||
    xLoading ||
    cafeLoading ||
    (postsLoading && unifiedPosts.length === 0);

  const reload = async () => {
    if (!hasAnySource) return;
    await memberPostsState.reload();
  };

  const headerActions = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {loadX && hasXSource ? (
          <SourceUpdateBadge
            icon={<Twitter className="h-3.5 w-3.5" />}
            label="X"
            updatedAt={xState.updatedAt}
            loading={xState.loading}
          />
        ) : null}
        {loadCafe && hasCafeSource ? (
          <SourceUpdateBadge
            icon={<Coffee className="h-3.5 w-3.5 text-emerald-600" />}
            label="네이버 카페"
            updatedAt={cafeState.updatedAt}
            loading={cafeState.loading}
          />
        ) : null}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-fit gap-2 rounded-full"
        onClick={() => void reload()}
        disabled={postsLoading || !hasAnySource}
      >
        <RefreshCw className={cn("h-4 w-4", postsLoading && "animate-spin")} />
        새로고침
      </Button>
    </>
  );

  return (
    <ContentPageShell
      title="멤버 게시글"
      leadingIcon={<MessageSquareText className="h-4.5 w-4.5 text-foreground" />}
      actions={headerActions}
      controls={
        memberSources.length > 0 ? (
          <div
            data-testid="member-post-filter-top"
            className="border-t border-border/60 pt-2 lg:hidden"
          >
            <MemberPostFilterBar
              items={memberSources}
              selectedUids={selectedMemberUids}
              onChange={setSelectedMemberUids}
            />
          </div>
        ) : null
      }
    >
      <MemberPostContentLayout
        filterItems={memberSources}
        selectedUids={selectedMemberUids}
        onFilterChange={setSelectedMemberUids}
      >
        {showInitialLoading ? (
          <MemberPostsSkeleton />
        ) : !hasAnySource ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-10 text-center">
            <MessageSquareText className="h-10 w-10 text-muted-foreground/70" />
            <p className="text-sm font-medium text-muted-foreground">
              등록된 X 계정 또는 네이버 카페 게시판이 없습니다.
            </p>
          </div>
        ) : timelinePosts.length === 0 ? (
          <div className="flex min-h-48 w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-10 text-center">
            {error ? (
              <AlertCircle className="h-10 w-10 text-muted-foreground/70" />
            ) : loadCafe && !loadX ? (
              <Coffee className="h-10 w-10 text-muted-foreground/70" />
            ) : (
              <Twitter className="h-10 w-10 text-muted-foreground/70" />
            )}
            <p className="text-sm font-medium text-muted-foreground">
              {error
                ? "멤버 게시글을 불러오지 못했습니다."
                : selectedMemberUids && selectedMemberUids.length > 0
                  ? "선택한 멤버의 게시글이 없습니다."
                  : "표시할 멤버 게시글이 없습니다."}
            </p>
            {error ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 rounded-full"
                onClick={() => void reload()}
                disabled={postsLoading}
              >
                <RefreshCw
                  className={cn("h-4 w-4", postsLoading && "animate-spin")}
                />
                다시 시도
              </Button>
            ) : selectedMemberUids && selectedMemberUids.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full"
                onClick={() => setSelectedMemberUids(null)}
              >
                전체 보기
              </Button>
            ) : null}
          </div>
        ) : (
          <div
            className={cn(MEMBER_POST_FEED_WIDTH_CLASS, "min-w-0 space-y-6")}
          >
            {error ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-800 dark:text-amber-200">
                {error}
              </div>
            ) : null}

            {timelineGroups.map((group) => (
              <section
                key={`${group.label}-${group.subLabel}`}
                className="min-w-0 space-y-3"
              >
                <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border/70 bg-card/80 px-3 py-2 shadow-sm">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-foreground">
                    {group.posts.length}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-foreground">
                      {group.label}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {group.subLabel} · {group.posts.length}건
                    </p>
                  </div>
                </div>

                <div
                  data-testid="member-post-feed-list"
                  className="flex min-w-0 flex-col gap-3"
                >
                  {group.posts.map((item) => {
                    const member = item.memberUid
                      ? memberMap.get(item.memberUid)
                      : undefined;
                    return item.kind === "x" ? (
                      <XPostCard
                        key={item.id}
                        post={item.post}
                        compactTime={formatPostTime(item.createdAt)}
                        member={member}
                      />
                    ) : (
                      <NaverCafePostCard
                        key={item.id}
                        post={item.post}
                        compactTime={formatPostTime(item.createdAt)}
                        member={member}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </MemberPostContentLayout>
    </ContentPageShell>
  );
};
