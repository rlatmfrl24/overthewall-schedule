import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { PiArrowsClockwiseBold, PiCaretDownBold } from "react-icons/pi";
import { useConsoleSearch } from "@/shared/lib/admin-console-search";
import { CONTENT_READ_QUERY_OPTIONS, currentContentQuery } from "@/shared/query/content-read-policy";
import { Button } from "@/shared/ui/button";
import { QueryReadback } from "@/shared/ui/query-readback";
import { SelectField } from "@/shared/ui/select-field";
import { AdminSectionHeader } from "./admin-section-header";

type HistoryPage<T> = {
  channels: { channelId: string; name: string; contentAccess: "normal" | "admin_archive" | null }[];
  items: T[];
  nextCursor: string | null;
};

export function SavedMediaHistory<T>({ title, description, queryName, fetchPage, renderItem, channelLabel, channelRequired = false }: {
  title: string;
  description: string;
  queryName: string;
  fetchPage: (channelId: string, cursor: string | null) => Promise<HistoryPage<T>>;
  renderItem: (item: T) => ReactNode;
  channelLabel: string;
  channelRequired?: boolean;
}) {
  const [search, updateSearch] = useConsoleSearch();
  const channelId = search.channel ?? "";
  const [position, setPosition] = useState<{ channelId: string; cursors: (string | null)[] }>({ channelId, cursors: [null] });
  const cursors = position.channelId === channelId ? position.cursors : [null];
  const cursor = cursors.at(-1) ?? null;
  const query = currentContentQuery(useQuery({
    queryKey: ["admin", queryName, channelId, cursor],
    queryFn: () => fetchPage(channelId, cursor),
    ...CONTENT_READ_QUERY_OPTIONS,
  }));
  const options = [...new Map((query.data?.channels ?? []).map((channel) => [channel.channelId, {
    value: channel.channelId,
    label: `${channel.name}${channel.contentAccess === "admin_archive" ? " · 관리자 보관" : ""}`,
  }])).values()];
  const selectChannel = (value: string) => {
    setPosition({ channelId: value, cursors: [null] });
    updateSearch({ channel: value || undefined }, false);
  };
  const items = query.data?.items ?? [];
  const nextCursor = query.data?.nextCursor;
  const needsChannel = channelRequired && !channelId;
  const empty = needsChannel
    ? options.length ? "채널을 선택하면 저장본을 볼 수 있습니다." : "조회할 수 있는 채널이 없습니다."
    : channelId ? "선택한 채널의 저장 이력이 없습니다." : "저장 이력이 없습니다.";

  return (
    <section className="min-w-0 space-y-4" aria-label={title}>
      <AdminSectionHeader title={title} description={description} actions={
        <Button variant="outline" className="min-h-11 md:min-h-9" onClick={() => void query.refetch()} disabled={query.isFetching}>
          <PiArrowsClockwiseBold className={query.isFetching ? "animate-spin" : undefined} aria-hidden="true" /> 상태 새로고침
        </Button>
      } />
      <div role="search" aria-label={`${title} 필터`} className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <label className="grid w-full min-w-0 gap-1 text-xs text-muted-foreground sm:max-w-sm">
          채널
          <SelectField aria-label={channelLabel} className="min-h-11 w-full text-foreground md:min-h-9" value={channelId} onValueChange={selectChannel} options={[
            { value: "", label: channelRequired ? "채널 선택" : "모든 저장 채널" }, ...options,
          ]} />
        </label>
        {channelId && <Button variant="ghost" size="sm" className="min-h-11 md:min-h-9" onClick={() => selectChannel("")}>채널 초기화</Button>}
      </div>
      {query.isError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-4 text-sm">
          <p className="text-destructive">저장 이력을 불러오지 못했습니다.</p>
          <Button variant="outline" className="min-h-11 md:min-h-9" onClick={() => void query.refetch()}>다시 시도</Button>
        </div>
      ) : <QueryReadback updatedAt={query.dataUpdatedAt} fetching={query.isFetching} className="my-0 px-1" />}
      {query.isLoading && <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">저장 이력을 확인하고 있습니다.</p>}
      {query.data && (items.length > 0
        ? <ul aria-label="저장 이력 목록" className="min-w-0 divide-y overflow-hidden rounded-xl border bg-card">{items.map(renderItem)}</ul>
        : <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{empty}</p>)}
      {(items.length > 0 || cursors.length > 1) && <nav aria-label="저장 이력 페이지" className="flex flex-wrap items-center justify-between gap-2 px-1">
        <span className="text-xs tabular-nums text-muted-foreground">{cursors.length}페이지{query.data && ` · ${items.length}건 표시`}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="min-h-11 md:min-h-9" disabled={cursors.length === 1 || query.isFetching} onClick={() => setPosition({ channelId, cursors: cursors.slice(0, -1) })}>이전</Button>
          <Button variant="outline" size="sm" className="min-h-11 md:min-h-9" disabled={!nextCursor || query.isFetching} onClick={() => { if (nextCursor) setPosition({ channelId, cursors: [...cursors, nextCursor] }); }}>다음</Button>
        </div>
      </nav>}
    </section>
  );
}

export function SavedMediaHistoryEntry({ title, badges, dates, children, metadata }: {
  title: string;
  badges: ReactNode;
  dates: ReactNode;
  children?: ReactNode;
  metadata: unknown;
}) {
  return (
    <li className="min-w-0 px-4 py-3">
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 space-y-1.5">
          <h3 className="font-semibold [overflow-wrap:anywhere]">{title}</h3>
          <div className="flex flex-wrap gap-1.5">{badges}</div>
          {children}
        </div>
        <dl className="space-y-1 text-xs text-muted-foreground tabular-nums [&>div]:flex [&>div]:flex-wrap [&>div]:gap-x-2">{dates}</dl>
      </div>
      <details className="group mt-2 min-w-0">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-muted md:min-h-9">
          저장 메타데이터 <PiCaretDownBold className="size-3.5 motion-safe:transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <pre className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md border bg-background p-3 text-xs [overflow-wrap:anywhere]">{JSON.stringify(metadata, null, 2)}</pre>
      </details>
    </li>
  );
}
