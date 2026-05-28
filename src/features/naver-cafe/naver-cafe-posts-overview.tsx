import { useMemo, useState } from "react";
import {
  AlertCircle,
  Coffee,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNaverCafePosts, useFilteredNaverCafePosts } from "@/hooks/use-naver-cafe-posts";
import { useScheduleData } from "@/hooks/use-schedule-data";
import { cn } from "@/lib/utils";
import type { Member, NaverCafePost } from "@/lib/types";
import { NaverCafePostCard } from "./naver-cafe-post-card";

type MemberCafeSource = {
  member: Member;
  sourceCount: number;
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

const groupPostsByDate = (posts: NaverCafePost[]) => {
  const groups = new Map<
    string,
    { label: string; subLabel: string; posts: NaverCafePost[] }
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

const NaverCafePostsSkeleton = () => (
  <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
    {Array.from({ length: 4 }).map((_, index) => (
      <div
        key={index}
        className="flex flex-col gap-4 rounded-lg border border-border/70 bg-card p-5"
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

const NaverCafeMemberFilterBar = ({
  items,
  selectedUids,
  onChange,
}: {
  items: MemberCafeSource[];
  selectedUids: number[] | null;
  onChange: (value: number[] | null) => void;
}) => {
  const selectedList = selectedUids ?? [];
  const isAllSelected = selectedList.length === 0;

  return (
    <div className="flex gap-2 overflow-x-auto px-px py-1">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(
          "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
          isAllSelected
            ? "border-foreground bg-foreground text-background"
            : "border-border bg-background text-muted-foreground hover:text-foreground",
        )}
      >
        전체
      </button>
      {items.map(({ member }) => {
        const selected = selectedList.includes(member.uid);
        const accentColor = member.main_color || "#03c75a";

        return (
          <button
            key={member.uid}
            type="button"
            aria-label={member.name}
            onClick={() => onChange([member.uid])}
            style={
              selected
                ? {
                    borderColor: accentColor,
                    boxShadow: `0 0 0 1px ${accentColor}`,
                  }
                : undefined
            }
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border bg-background px-3 text-sm font-medium transition-colors",
              selected
                ? "text-foreground shadow-sm"
                : isAllSelected
                  ? "border-border text-muted-foreground hover:text-foreground"
                  : "border-border text-muted-foreground/60 opacity-60 hover:text-foreground hover:opacity-100",
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
            <span>{member.name}</span>
          </button>
        );
      })}
    </div>
  );
};

export const NaverCafePostsOverview = () => {
  const [selectedMemberUids, setSelectedMemberUids] = useState<number[] | null>(
    null,
  );
  const {
    members,
    loading: membersLoading,
    hasLoaded: membersLoaded,
  } = useScheduleData();
  const {
    posts,
    sources,
    updatedAt,
    loading: postsLoading,
    error,
    hasLoaded: postsLoaded,
    reload,
  } = useNaverCafePosts({ enabled: true, size: 10 });

  const memberMap = useMemo(
    () => new Map(members.map((member) => [member.uid, member])),
    [members],
  );
  const memberSources = useMemo(() => {
    const counts = new Map<number, number>();
    for (const source of sources) {
      if (!source.memberUid || !source.enabled) continue;
      counts.set(source.memberUid, (counts.get(source.memberUid) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([memberUid, sourceCount]) => {
        const member = memberMap.get(memberUid);
        return member ? { member, sourceCount } : null;
      })
      .filter((item): item is MemberCafeSource => item !== null);
  }, [memberMap, sources]);

  const filteredPosts = useFilteredNaverCafePosts(posts, selectedMemberUids);
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
  const enabledSourceCount = sources.filter((source) => source.enabled).length;
  const showInitialLoading =
    membersLoading ||
    !membersLoaded ||
    (!postsLoaded && posts.length === 0) ||
    (postsLoading && posts.length === 0);

  return (
    <div className="flex w-full flex-1 flex-col overflow-y-auto overflow-x-hidden">
      <div className="container mx-auto flex min-w-0 w-full max-w-7xl flex-col gap-4 px-4 pb-8 pt-5">
        <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background">
              <Coffee className="h-4.5 w-4.5 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
                카페 최신글
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm text-muted-foreground">
              마지막 업데이트 ·{" "}
              <span className="font-medium text-foreground">
                {formatUpdatedAt(updatedAt)}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-fit gap-2 rounded-full"
              onClick={() => void reload()}
              disabled={postsLoading || enabledSourceCount === 0}
            >
              <RefreshCw
                className={cn("h-4 w-4", postsLoading && "animate-spin")}
              />
              새로고침
            </Button>
          </div>
        </div>

        {memberSources.length > 0 ? (
          <NaverCafeMemberFilterBar
            items={memberSources}
            selectedUids={selectedMemberUids}
            onChange={setSelectedMemberUids}
          />
        ) : null}

        {showInitialLoading ? (
          <NaverCafePostsSkeleton />
        ) : enabledSourceCount === 0 ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center">
            <Coffee className="h-10 w-10 text-muted-foreground/70" />
            <p className="text-sm text-muted-foreground">
              등록된 네이버 카페 게시판이 없습니다.
            </p>
          </div>
        ) : timelinePosts.length === 0 ? (
          <div className="mx-auto flex min-h-[260px] w-full max-w-[760px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center">
            {error ? (
              <AlertCircle className="h-10 w-10 text-muted-foreground/70" />
            ) : (
              <Coffee className="h-10 w-10 text-muted-foreground/70" />
            )}
            <p className="text-sm text-muted-foreground">
              {error
                ? "카페 최신글을 불러오지 못했습니다."
                : selectedMemberUids && selectedMemberUids.length > 0
                  ? "선택한 멤버의 카페 최신글이 없습니다."
                  : "표시할 카페 최신글이 없습니다."}
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
          <div className="mx-auto w-full max-w-[760px] min-w-0 space-y-8">
            {error ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                {error}
              </div>
            ) : null}

            {timelineGroups.map((group) => (
              <section
                key={`${group.label}-${group.subLabel}`}
                className="grid min-w-0 gap-4 sm:grid-cols-[92px_minmax(0,1fr)]"
              >
                <div className="relative hidden pt-5 text-sm text-muted-foreground sm:block">
                  <div className="sticky top-24">
                    <p className="font-semibold text-foreground">
                      {group.label}
                    </p>
                    <p className="mt-1 text-xs">{group.subLabel}</p>
                  </div>
                  <span className="absolute right-2 top-7 h-2.5 w-2.5 rounded-full border border-border bg-background" />
                  <span className="absolute bottom-0 right-[12px] top-9 w-px bg-border" />
                </div>

                <div className="min-w-0 space-y-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground sm:hidden">
                    <span className="font-semibold text-foreground">
                      {group.label}
                    </span>
                    <span>{group.subLabel}</span>
                  </div>
                  {group.posts.map((post) => (
                    <NaverCafePostCard
                      key={post.id}
                      post={post}
                      compactTime={formatPostTime(post.createdAt)}
                      member={
                        post.memberUid ? memberMap.get(post.memberUid) : undefined
                      }
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
