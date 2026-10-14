import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CONTENT_READ_QUERY_OPTIONS, currentContentQuery } from "@/shared/query/content-read-policy";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { SelectField } from "@/shared/ui/select-field";
import { fetchYouTubeHistory } from "../../api/history";

export function YouTubeHistory() {
  const [channelId, setChannelId] = useState("");
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const cursor = cursors.at(-1) ?? null;
  const query = currentContentQuery(useQuery({ queryKey: ["admin", "youtube-history", channelId, cursor], queryFn: () => fetchYouTubeHistory(channelId, cursor), ...CONTENT_READ_QUERY_OPTIONS }));
  return <section className="space-y-3" aria-label="YouTube 저장 이력">
    <h2 className="text-lg font-semibold">YouTube 저장 이력</h2>
    <p className="text-sm text-muted-foreground">공식 영상·Shorts·다시보기의 저장된 메타데이터입니다. 관리자 보관 자료를 포함하며 읽기 전용입니다.</p>
    <SelectField aria-label="저장 영상 채널" value={channelId} onValueChange={value => { setChannelId(value); setCursors([null]); }} options={[{ value: "", label: "모든 저장 채널" }, ...[...new Map((query.data?.channels ?? []).map(channel => [channel.channelId, { value: channel.channelId, label: `${channel.name}${channel.contentAccess === "admin_archive" ? " · 관리자 보관" : ""}` }])).values()]]} />
    {query.isLoading && <p role="status">저장 이력을 확인하고 있습니다.</p>}
    {query.isError && <p role="alert">저장 이력을 불러오지 못했습니다. <Button variant="outline" onClick={() => void query.refetch()}>다시 시도</Button></p>}
    {query.data && <>
      {!query.data.items.length && <p>저장된 영상이 없습니다.</p>}
      <ul className="space-y-3">{query.data.items.map(item => <li key={item.videoId} className="rounded-md border p-3">
        <div className="flex flex-wrap gap-2"><strong>{item.title}</strong><Badge variant="outline">{item.contentAccess === "admin_archive" ? "관리자 보관 · 읽기 전용" : "일반 · 읽기 전용"}</Badge><Badge variant="secondary">{item.isShort ? "Shorts" : "영상 / 다시보기"}</Badge></div>
        <p className="text-xs text-muted-foreground">{item.channelTitle || item.channelId} · 게시 {item.publishedAt} · 저장 {item.storedAt}{item.available ? "" : " · 제공자에서 이용 불가"}</p>
        <details><summary className="cursor-pointer text-sm">저장 메타데이터</summary><pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(item, null, 2)}</pre></details>
      </li>)}</ul>
    </>}
    <div className="flex gap-2"><Button variant="outline" disabled={cursors.length === 1 || query.isFetching} onClick={() => setCursors(previous => previous.slice(0, -1))}>이전</Button><Button variant="outline" disabled={!query.data?.nextCursor || query.isFetching} onClick={() => setCursors(previous => [...previous, query.data!.nextCursor])}>다음</Button></div>
  </section>;
}
