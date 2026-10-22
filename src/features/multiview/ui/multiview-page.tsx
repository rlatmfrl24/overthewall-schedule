import { site } from "@/shared/config/site";
import { Check, ExternalLink, MonitorPlay, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { useScheduleData } from "@/features/schedule-board";
import { cn } from "@/shared/lib/utils";
import { buildMulLiveUrl, buildMultiviewSearchParams, MAX_MULTIVIEW_CHANNELS, parseMultiviewUrlState } from "../model/multiview-utils";
import type { MultiviewSource } from "../model/types";
import { useMultiviewSources } from "../queries/use-multiview-sources";
import { usePersonalMultiview } from "../queries/use-personal-multiview";
import { PersonalChannelManager } from "./personal-channel-manager";

const initialChannels = () => typeof window === "undefined" ? []
  : parseMultiviewUrlState(new URLSearchParams(window.location.search)).channelIds;
const sourceName = (source: MultiviewSource) => source.member?.name ?? source.liveStatus?.channelName ?? source.saved?.channelName ?? source.channelId;
const toggleSelection = (ids: string[], id: string) => ids.includes(id)
  ? ids.filter((value) => value !== id)
  : ids.length < MAX_MULTIVIEW_CHANNELS ? [...ids, id] : ids;

function ExternalWatchLink({ ids }: { ids: string[] }) {
  return ids.length ? <Button asChild className="min-h-11">
    <a href={buildMulLiveUrl(ids)} target="_blank" rel="noopener noreferrer">
      <ExternalLink aria-hidden="true" /> Mul.Live에서 보기
      <span className="rounded bg-primary-foreground/15 px-1.5 py-0.5 text-[10px]">추천</span>
    </a>
  </Button> : <Button disabled className="min-h-11"><ExternalLink aria-hidden="true" /> Mul.Live에서 보기 <span className="text-xs">추천</span></Button>;
}

type PickerProps = {
  sources: MultiviewSource[];
  ids: string[];
  onToggle: (id: string) => void;
  loading: boolean;
  membersLoading: boolean;
  hasLoaded: boolean;
  isError: boolean;
  reload: () => void;
  onRemove?: (id: string) => void;
  deletingIds?: string[];
};

function MemberPicker({ sources, ids, onToggle, loading, membersLoading, hasLoaded, isError, reload, onRemove, deletingIds = [] }: PickerProps) {
  const uniqueSources = [...new Map(sources.map((source) => [source.channelId, source])).values()];
  const knownIds = new Set(uniqueSources.map((source) => source.channelId));
  const failed = (source: MultiviewSource) => source.statusError ?? isError;
  const live = uniqueSources.filter((source) => !failed(source) && source.isLive);
  const offline = uniqueSources.filter((source) => !failed(source) && !source.isLive && source.liveStatus?.status === "CLOSE");
  const unknown = uniqueSources.filter((source) => failed(source) || (!source.isLive && source.liveStatus?.status !== "CLOSE"));
  const missing = ids.filter((id) => !knownIds.has(id));
  const pending = !hasLoaded && loading;
  const groups = [
    { key: "live", title: "방송 중", items: live, empty: "현재 방송 중인 멤버가 없습니다." },
    { key: "offline", title: "방송 중이 아닌 멤버", items: offline, empty: "방송 중이 아닌 멤버가 없습니다." },
    ...(unknown.length ? [{ key: "unknown", title: pending ? "상태 확인 중" : "상태 확인 불가", items: unknown, empty: "" }] : []),
  ];

  return <div className="space-y-6">
    {isError || (!loading && unknown.length > 0) ? <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
      일부 멤버의 방송 상태를 확인하지 못했습니다. 멤버는 계속 선택할 수 있습니다.
      <Button variant="outline" size="sm" disabled={loading} onClick={reload}>상태 다시 확인</Button>
    </div> : null}
    {membersLoading && sources.length === 0 ? <div role="status" aria-label="멤버 불러오는 중" className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-20" />)}
    </div> : uniqueSources.length === 0 ? <p role="status">선택할 수 있는 CHZZK 멤버가 없습니다.</p> : groups.map((group) => (
      <section key={group.key} aria-label={group.title} className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold"><span>{group.title}</span><span className="text-sm font-normal text-muted-foreground">{group.items.length}</span></h2>
        {group.items.length === 0 ? <p className="text-sm text-muted-foreground">{isError ? "방송 상태를 확인할 수 없습니다." : pending ? "방송 상태를 확인하고 있습니다." : group.empty}</p> :
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{group.items.map((source) => {
            const selected = ids.includes(source.channelId);
            const disabled = ids.length >= MAX_MULTIVIEW_CHANNELS && !selected;
            const name = sourceName(source);
            const isLive = !failed(source) && source.isLive;
            const isOffline = !failed(source) && source.liveStatus?.status === "CLOSE";
            return <div key={source.channelId} className="flex min-w-0 items-stretch gap-1"><button type="button" aria-pressed={selected} disabled={disabled}
              aria-label={disabled ? `${name} 선택 불가 (최대 ${MAX_MULTIVIEW_CHANNELS}개)` : `${name} ${selected ? "선택 해제" : "선택"}`}
              onClick={() => onToggle(source.channelId)}
              className={cn("flex min-h-20 min-w-0 flex-1 items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                selected ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-accent")}>
              {source.member ? <img src={`/profile/${source.member.code}.webp`} alt="" className="size-11 shrink-0 rounded-full bg-muted object-cover" loading="lazy" /> : source.saved?.channelImageUrl ? <img src={source.saved.channelImageUrl} alt="" className="size-11 shrink-0 rounded-full bg-muted object-cover" loading="lazy" referrerPolicy="no-referrer" /> : <MonitorPlay aria-hidden="true" className="size-11 shrink-0" />}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2"><span className="truncate font-semibold">{name}</span>{isLive ? <span className="rounded bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-white">LIVE</span> : null}</span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">{isLive ? source.liveStatus?.liveTitle || "방송 중" : isOffline ? "방송 중이 아닙니다" : pending ? "상태 확인 중" : "상태 확인 불가"}</span>
                {isLive && source.liveStatus?.concurrentUserCount != null ? <span className="block text-xs text-muted-foreground">{source.liveStatus.concurrentUserCount.toLocaleString("ko-KR")}명 시청 중</span> : null}
              </span>
              <span aria-hidden="true" className={cn("grid size-5 shrink-0 place-items-center rounded border", selected ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                {selected ? <Check className="size-3.5" /> : null}
              </span>
            </button>{source.saved && onRemove ? <Button variant="ghost" size="icon" className="min-h-11 min-w-11 self-center" aria-label={`${name} 저장 목록에서 삭제`} disabled={deletingIds.includes(source.channelId)} onClick={() => onRemove(source.channelId)}><X aria-hidden="true" /></Button> : null}</div>;
          })}</div>}
      </section>
    ))}
    {missing.length ? <section aria-label="목록에 없는 선택 채널" className="space-y-2">
      <h2 className="font-semibold">목록에 없는 선택 채널</h2>
      {missing.map((id) => <div key={id} className="flex min-w-0 items-center gap-2 rounded-lg border p-3">
        <span className="min-w-0 flex-1 break-all text-sm">{id}</span>
        <Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={`${id} 선택 해제`} onClick={() => onToggle(id)}><X aria-hidden="true" /></Button>
      </div>)}
    </section> : null}
  </div>;
}

export function MultiviewPage() {
  const [ids, setIds] = useState(initialChannels);
  const { loading: membersLoading, members } = useScheduleData();
  const personal = usePersonalMultiview();
  const { sources, loading, hasLoaded, isError, reload } = useMultiviewSources(members, { channels: personal.channels, statuses: personal.statuses, loading: personal.statusLoading, isError: Boolean(personal.statusError) });

  useEffect(() => {
    const params = buildMultiviewSearchParams({ channelIds: ids });
    const next = `${window.location.pathname}${params.size ? `?${params}` : ""}`;
    if (`${window.location.pathname}${window.location.search}` !== next) window.history.replaceState(window.history.state, "", next);
  }, [ids]);
  useEffect(() => {
    const onPopState = () => setIds(initialChannels());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const pickerProps = { sources, loading, membersLoading, hasLoaded, isError, reload: () => { void reload(); void personal.reload(); }, deletingIds: personal.deletingIds, onRemove: (id: string) => { void personal.remove(id).catch(() => {}); } };
  const toggle = (id: string) => setIds((current) => toggleSelection(current, id));
  const returnParams = buildMultiviewSearchParams({ channelIds: ids });

  return <main data-testid="multiview-root" className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-7 p-4 sm:p-6">
          <header className="space-y-2"><h1 className="flex items-center gap-2 text-xl font-bold"><MonitorPlay aria-hidden="true" />{site.siteName} 멀티뷰</h1>
            <p className="text-sm text-muted-foreground">함께 볼 멤버를 선택하고 Mul.Live에서 시청해 주세요. 최대 {MAX_MULTIVIEW_CHANNELS}명까지 선택할 수 있습니다.</p></header>
          <Alert>
            <AlertTitle>치지직 멀티뷰 시청 안내</AlertTitle>
            <AlertDescription>
              <p>최근 치지직 업데이트로 인해 Mul.Live에서 방송을 시청하려면 Mul.Live Plus 확장 프로그램이 필요합니다. 최신 버전을 설치하거나 업데이트한 뒤 Mul.Live에서 시청해 주세요.</p>
              <a href="https://chromewebstore.google.com/detail/mullive-plus/pahcphmhihleneomklgfbbneokhjiaim" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-medium text-foreground underline underline-offset-4">Mul.Live Plus 설치<ExternalLink aria-hidden="true" className="size-4" /></a>
            </AlertDescription>
          </Alert>
          <PersonalChannelManager key={personal.owner ?? "anonymous"} personal={personal} returnUrl={`/multiview${returnParams.size ? `?${returnParams}` : ""}`} />
          <MemberPicker {...pickerProps} ids={ids} onToggle={toggle} />
        </div>
      </div>
      <footer className="shrink-0 border-t bg-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
        <div className="mx-auto max-w-6xl space-y-3">
          <div className="flex flex-wrap items-center gap-2"><span role="status" className="mr-auto text-sm font-medium">선택 {ids.length}/{MAX_MULTIVIEW_CHANNELS}{!ids.length ? " · 시청할 멤버를 선택해 주세요" : ""}</span>
            <Button variant="ghost" size="sm" className="min-h-11" disabled={!ids.length} onClick={() => setIds([])}><RotateCcw aria-hidden="true" />초기화</Button></div>
          <div className="grid gap-2 sm:flex"><ExternalWatchLink ids={ids} /><Button variant="outline" className="min-h-11" disabled aria-describedby="multiview-embed-unavailable"><MonitorPlay aria-hidden="true" />이 화면에서 보기</Button></div>
          <p id="multiview-embed-unavailable" className="text-xs leading-relaxed text-muted-foreground">이 화면에서 보기는 일시 중단되었습니다. 현재는 Mul.Live에서 보기로 이용해 주세요.</p>
        </div>
      </footer>
  </main>;
}
