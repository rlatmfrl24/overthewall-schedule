import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CONTENT_READ_QUERY_OPTIONS, currentContentQuery } from "@/shared/query/content-read-policy";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { SelectField } from "@/shared/ui/select-field";
import { fetchChzzkHistory } from "../api/history";

export function ChzzkHistory() {
  const [channelId, setChannelId] = useState("");
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const cursor = cursors.at(-1) ?? null;
  const query = currentContentQuery(useQuery({ queryKey: ["admin", "chzzk-history", channelId, cursor], queryFn: () => fetchChzzkHistory(channelId, cursor), ...CONTENT_READ_QUERY_OPTIONS }));
  return <section className="space-y-3" aria-label="CHZZK 저장 이력">
    <h2 className="text-lg font-semibold">CHZZK 저장 이력</h2>
    <p className="text-sm text-muted-foreground">보유 중인 다시보기·클립 저장본입니다. 관리자 보관 자료와 만료된 저장본을 읽기 전용으로 확인합니다.</p>
    <SelectField aria-label="저장 이력 채널" value={channelId} onValueChange={value => { setChannelId(value); setCursors([null]); }} options={[{ value: "", label: "채널을 선택하세요" }, ...[...new Map((query.data?.channels ?? []).map(channel => [channel.channelId, { value: channel.channelId, label: `${channel.name}${channel.contentAccess === "admin_archive" ? " · 관리자 보관" : ""}` }])).values()]]} />
    {query.isLoading && <p role="status">저장 이력을 확인하고 있습니다.</p>}
    {query.isError && <p role="alert">저장 이력을 불러오지 못했습니다. <Button variant="outline" onClick={() => void query.refetch()}>다시 시도</Button></p>}
    {query.data && channelId && !query.data.snapshots.length && <p>보유 중인 저장본이 없습니다.</p>}
    {query.data?.snapshots.map(snapshot => <article key={snapshot.key} className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap gap-2"><h3 className="font-medium">{snapshot.type === "vods" ? "다시보기" : "클립"}</h3><Badge variant="outline">{snapshot.contentAccess === "admin_archive" ? "관리자 보관 · 읽기 전용" : snapshot.contentAccess === "normal" ? "일반 · 읽기 전용" : "저장 이력 · 읽기 전용"}</Badge></div>
      <p className="text-xs text-muted-foreground">저장 {snapshot.storedAt}</p>
      <ul>{snapshot.content.data.map((item, index) => <li key={index}>{"videoTitle" in item ? item.videoTitle : item.clipTitle}</li>)}</ul>
      <details><summary className="cursor-pointer text-sm">저장 메타데이터</summary><pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(snapshot.content, null, 2)}</pre></details>
    </article>)}
    <div className="flex gap-2"><Button variant="outline" disabled={cursors.length === 1 || query.isFetching} onClick={() => setCursors(previous => previous.slice(0, -1))}>이전</Button><Button variant="outline" disabled={!query.data?.nextCursor || query.isFetching} onClick={() => setCursors(previous => [...previous, query.data!.nextCursor])}>다음</Button></div>
  </section>;
}
