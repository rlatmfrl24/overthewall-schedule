import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, MessageSquareText } from "lucide-react";
import { useScheduleData } from "@/features/schedule-board";
import { getMembersWithXHandles, XPostCard } from "@/features/x-posts";
import { NaverCafePostCard } from "@/features/naver-cafe";
import { ContentPageShell } from "@/shared/ui/content-page-shell";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { useMemberPosts } from "../queries/use-member-posts";
import { filterFeed, groupFeed } from "../model/feed-filters";
import { FeedMemberList, FeedUpdatedAt } from "./feed-navigation";

export function MemberPostsOverview({ loadX, loadCafe, footer }: {
  loadX: boolean; loadCafe: boolean; footer?: ReactNode;
}) {
  const [memberUid, setMemberUid] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const resetScroll = useRef(false);
  const { members, loading: membersLoading, hasLoaded: membersLoaded } = useScheduleData();
  const state = useMemberPosts({ includeX: loadX, includeNaverCafe: loadCafe, maxResults: 10, size: 10 });
  const xAllowed = loadX && state.x.policy.accessible;
  const cafeAllowed = loadCafe && state.naverCafe.policy.accessible;
  const memberMap = useMemo(() => new Map(members.map(member => [member.uid, member])), [members]);
  const xMembers = useMemo(() => getMembersWithXHandles(members), [members]);
  const xNames = useMemo(() => new Map(xMembers.map(({ member, handle }) => [handle.toLowerCase(), member.name])), [xMembers]);
  const filterMembers = useMemo(() => {
    const uids = new Set<number>();
    if (xAllowed) for (const { member } of xMembers) uids.add(member.uid);
    if (cafeAllowed) for (const item of state.naverCafe.sources) if (item.enabled && item.memberUid) uids.add(item.memberUid);
    return members.filter(member => uids.has(member.uid)).sort((a, b) => a.uid - b.uid);
  }, [members, xAllowed, cafeAllowed, xMembers, state.naverCafe.sources]);
  const accessiblePosts = useMemo(() => state.posts.filter(post => post.kind === "x" ? xAllowed : cafeAllowed), [state.posts, xAllowed, cafeAllowed]);
  const filtered = useMemo(() => filterFeed(accessiblePosts, memberUid, "all"), [accessiblePosts, memberUid]);
  const groups = useMemo(() => groupFeed(filtered), [filtered]);
  useLayoutEffect(() => {
    if (!resetScroll.current) return;
    resetScroll.current = false;
    const scroll = scrollRef.current;
    const result = resultsRef.current;
    if (!scroll || !result) return;
    const toolbar = scroll.querySelector('[data-testid="feed-toolbar"]');
    const besideResults = toolbar && getComputedStyle(toolbar).position === "sticky";
    // Keep keyboard-operated filters visible when the mobile toolbar scrolls away.
    if (!besideResults && document.activeElement?.matches(":focus-visible") && toolbar?.contains(document.activeElement)) return;
    scroll.scrollTop = Math.max(0, scroll.scrollTop + result.getBoundingClientRect().top - scroll.getBoundingClientRect().top);
  }, [memberUid]);

  const selectMember = (uid: number | null) => { resetScroll.current = true; setMemberUid(uid); };
  const retry = () => { void state.reload().catch(() => undefined); };
  const loading = !membersLoaded || membersLoading || (!state.hasLoaded && !state.posts.length);
  const blocked = !loading && !state.error && !xAllowed && !cafeAllowed;
  const toolbar = <div data-testid="feed-toolbar" role="group" aria-label="게시글 필터" className="min-w-0 space-y-3 lg:sticky lg:top-3 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto">
    <div role="group" aria-label="멤버" className="min-w-0">
      <FeedMemberList members={filterMembers} selected={memberUid} onSelect={selectMember} />
    </div>
  </div>;

  return <ContentPageShell title="멤버 게시글" leadingIcon={<MessageSquareText className="size-4.5" />}
    headerPlacement="fixed" scrollRef={scrollRef} footer={footer}
    headerClassName="overflow-y-auto [scrollbar-gutter:stable]"
    headerInnerClassName="max-w-[632px] px-3 sm:px-4 lg:px-4 xl:px-4 [&>div]:flex-row [&>div]:flex-wrap [&>div]:items-center [&>div]:justify-between lg:[&>div>div:first-child]:relative lg:[&>div>div:first-child>div]:absolute lg:[&>div>div:first-child>div]:right-[calc(100%+12px)]" contentClassName="max-w-[632px] lg:max-w-[1064px] px-3 pt-3 pb-3 sm:px-4 lg:px-4 xl:px-4"
    actions={<FeedUpdatedAt value={state.feedUpdatedAt} loading={state.loading} />}>
    <div data-testid="member-post-content-layout" className="grid min-w-0 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_648px_minmax(0,1fr)] lg:gap-4 lg:pr-12">
      {toolbar}
      <div ref={resultsRef} role="region" tabIndex={0} aria-label="멤버 게시글 목록"
        className="mx-auto w-full min-w-0 max-w-[648px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-busy={loading}>
        {loading ? <div aria-label="게시글 불러오는 중" className="space-y-3 p-4">{[0, 1, 2].map(index => <Skeleton key={index} className="h-48 w-full rounded-lg" />)}</div> : blocked ?
          <div className="p-6 text-sm text-muted-foreground">{[state.x.policy, state.naverCafe.policy].filter(policy => policy.requested).map(policy => <p key={policy.source}>{policy.source === "x" ? "X 게시글" : "네이버 카페 최신글"}{policy.status === "disabled" ? " 표시가 비활성화되어 있습니다." : policy.status === "private" ? "은 비공개 상태입니다." : "에 접근할 수 없습니다."}</p>)}</div> : !filtered.length ?
          <div role="status" className="space-y-3 px-4 py-12 text-center text-sm text-muted-foreground">
            <p>{state.error ? "게시글을 불러오지 못했습니다." : "조건에 맞는 게시글이 없습니다."}</p>
            {state.error && <Button variant="outline" className="min-h-11" onClick={retry}>다시 시도</Button>}
          </div> : groups.map(group => <section key={group.key} className="min-w-0">
            <h2 className="flex items-center gap-2 py-3 text-sm font-medium text-muted-foreground"><CalendarDays aria-hidden="true" className="size-3.5 shrink-0" /><span className="shrink-0 text-foreground">{group.label}</span><span aria-hidden="true" className="ml-1 h-px min-w-0 flex-1 bg-border/60" /></h2>
            <div data-testid="member-post-feed-list" className="grid min-w-0 grid-cols-1 items-start gap-4">{group.posts.map(item => {
              const member = item.memberUid === null ? undefined : memberMap.get(item.memberUid);
              const time = new Date(item.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
              return item.kind === "x"
                ? <XPostCard key={item.id} appearance="card" post={{ ...item.post, replyTargetMemberName: xNames.get(item.post.reply?.targetUsername?.toLowerCase() ?? "") }} member={member} compactTime={time} />
                : <NaverCafePostCard key={item.id} appearance="card" post={item.post} member={member} compactTime={time} />;
            })}</div>
          </section>)}
      </div>
    </div>
  </ContentPageShell>;
}
