import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useScheduleData } from "@/hooks/use-schedule-data";
import { useFilteredXPosts, useXPosts } from "@/hooks/use-x-posts";
import { getMembersWithXHandles } from "@/lib/api/x";
import { cn } from "@/lib/utils";
import { XPostCard } from "./x-post-card";
import type { Member, XPost } from "@/lib/types";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Twitter,
} from "lucide-react";
import IconX from "@/assets/icon_x.svg";

type MemberXHandle = {
  member: Member;
  handle: string;
};

const XPostsSkeleton = () => {
  return (
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
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <Skeleton className="aspect-video w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
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
  const key = startOfDate.toISOString();
  const label =
    diffDays === 0 ? "오늘" : diffDays === 1 ? "어제" : `${diffDays}일 전`;
  const subLabel = date.toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });

  return { key, label, subLabel };
};

const formatPostTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const groupPostsByDate = (posts: XPost[]) => {
  const groups = new Map<
    string,
    { label: string; subLabel: string; posts: XPost[] }
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

const XMemberFilterBar = ({
  items,
  selectedUids,
  onChange,
}: {
  items: MemberXHandle[];
  selectedUids: number[] | null;
  onChange: (value: number[] | null) => void;
}) => {
  const selectedList = selectedUids ?? [];
  const isAllSelected = selectedList.length === 0;

  const selectMember = (memberUid: number) => onChange([memberUid]);

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
      {items.map(({ member, handle }) => {
        const selected = selectedList.includes(member.uid);
        const accentColor = member.main_color || "#111111";

        return (
          <button
            key={`${member.uid}-${handle}`}
            type="button"
            aria-label={member.name}
            onClick={() => selectMember(member.uid)}
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

const FeedStatusRail = ({
  membersWithXHandles,
  updatedAt,
  visiblePostCount,
  stale,
}: {
  membersWithXHandles: MemberXHandle[];
  updatedAt: string | null;
  visiblePostCount: number;
  stale: boolean;
}) => {
  return (
    <aside className="order-first space-y-4 lg:order-none lg:sticky lg:top-24">
      <section className="rounded-lg border border-border/70 bg-card p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">피드 상태</h2>
          {stale ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
              <Clock3 className="h-3 w-3" />
              캐시
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-3 w-3" />
              정상
            </span>
          )}
        </div>

        <dl className="grid grid-cols-3 gap-3 text-center lg:grid-cols-1 lg:text-left">
          <div className="rounded-md bg-muted/40 p-3">
            <dt className="text-xs text-muted-foreground">마지막 업데이트</dt>
            <dd className="mt-1 text-sm font-semibold text-foreground">
              {formatUpdatedAt(updatedAt)}
            </dd>
          </div>
          <div className="rounded-md bg-muted/40 p-3">
            <dt className="text-xs text-muted-foreground">표시 중 게시글</dt>
            <dd className="mt-1 text-sm font-semibold text-foreground">
              {visiblePostCount}건
            </dd>
          </div>
          <div className="rounded-md bg-muted/40 p-3">
            <dt className="text-xs text-muted-foreground">등록된 계정</dt>
            <dd className="mt-1 text-sm font-semibold text-foreground">
              {membersWithXHandles.length}개
            </dd>
          </div>
        </dl>
      </section>
    </aside>
  );
};

export const XPostsOverview = () => {
  const [selectedMemberUids, setSelectedMemberUids] = useState<number[] | null>(
    null,
  );
  const {
    members,
    loading: membersLoading,
    hasLoaded: membersLoaded,
  } = useScheduleData();

  const membersWithXHandles = useMemo(
    () => getMembersWithXHandles(members),
    [members],
  );
  const membersWithX = useMemo(
    () => membersWithXHandles.map(({ member }) => member),
    [membersWithXHandles],
  );
  const memberMap = useMemo(
    () => new Map(members.map((member) => [member.uid, member])),
    [members],
  );

  const {
    posts,
    updatedAt,
    loading: postsLoading,
    error,
    stale,
    hasLoaded: postsLoaded,
    reload,
  } = useXPosts(membersWithX, {
    enabled: true,
    maxResults: 5,
  });
  const filteredPosts = useFilteredXPosts(posts, selectedMemberUids);
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

  const showInitialLoading =
    membersLoading ||
    !membersLoaded ||
    ((!postsLoaded && membersWithX.length > 0) ||
      (postsLoading && posts.length === 0));
  const hasMembersWithX = membersWithX.length > 0;

  return (
    <div className="flex w-full flex-1 flex-col overflow-y-auto">
      <div className="container mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 pb-8 pt-5">
        <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background">
              <img src={IconX} alt="X" className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
                멤버 최신 게시글
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
              disabled={postsLoading || !hasMembersWithX}
            >
              <RefreshCw
                className={cn("h-4 w-4", postsLoading && "animate-spin")}
              />
              새로고침
            </Button>
          </div>
        </div>

        {hasMembersWithX ? (
          <XMemberFilterBar
            items={membersWithXHandles}
            selectedUids={selectedMemberUids}
            onChange={setSelectedMemberUids}
          />
        ) : null}

        {showInitialLoading ? (
          <XPostsSkeleton />
        ) : !hasMembersWithX ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center">
            <Twitter className="h-10 w-10 text-muted-foreground/70" />
            <p className="text-sm text-muted-foreground">
              X 계정이 등록된 멤버가 없습니다.
            </p>
          </div>
        ) : timelinePosts.length === 0 ? (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,760px)_320px] lg:justify-center">
            <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center">
              {error ? (
                <AlertCircle className="h-10 w-10 text-muted-foreground/70" />
              ) : (
                <Twitter className="h-10 w-10 text-muted-foreground/70" />
              )}
              <p className="text-sm text-muted-foreground">
                {error
                  ? "게시글을 불러오지 못했습니다."
                  : selectedMemberUids && selectedMemberUids.length > 0
                    ? "선택한 멤버의 X 게시글이 없습니다."
                    : "표시할 X 게시글이 없습니다."}
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
            <FeedStatusRail
              membersWithXHandles={membersWithXHandles}
              updatedAt={updatedAt}
              visiblePostCount={timelinePosts.length}
              stale={stale}
            />
          </div>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,760px)_320px] lg:justify-center">
            <div className="space-y-8">
              {error ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                  {error}
                </div>
              ) : null}

              {timelineGroups.map((group) => (
                <section
                  key={`${group.label}-${group.subLabel}`}
                  className="grid gap-4 sm:grid-cols-[92px_minmax(0,1fr)]"
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

                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground sm:hidden">
                      <span className="font-semibold text-foreground">
                        {group.label}
                      </span>
                      <span>{group.subLabel}</span>
                    </div>
                    {group.posts.map((post) => (
                      <XPostCard
                        key={post.id}
                        post={post}
                        compactTime={formatPostTime(post.createdAt)}
                        member={
                          post.memberUid
                            ? memberMap.get(post.memberUid)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <FeedStatusRail
              membersWithXHandles={membersWithXHandles}
              updatedAt={updatedAt}
              visiblePostCount={timelinePosts.length}
              stale={stale}
            />
          </div>
        )}
      </div>
    </div>
  );
};
