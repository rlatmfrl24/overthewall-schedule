import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { OtwPlayAdminChannelDto } from "@contracts/otw-play";
import { useOtwPlayChannelMonitors } from "../../queries/use-admin-catalog";
import { createOtwPlayChannelMonitor, updateOtwPlayChannelMonitor, deleteOtwPlayChannelMonitor, backfillOtwPlayChannelMonitor } from "../../api/admin";
import { queryKeys } from "@/shared/query/query-keys";
import { Button } from "@/shared/ui/button";
import { useToast } from "@/shared/ui/toast";
export function ChannelCollectionSettings({ channel }: { channel: OtwPlayAdminChannelDto }) {
  const query = useOtwPlayChannelMonitors();
  const client = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState("20");
  const monitor = query.data?.find(item => item.channelId === channel.id);
  const run = async (task: () => Promise<unknown>) => {
    setBusy(true);
    try { await task(); await client.invalidateQueries({ queryKey: queryKeys.otwPlay.all }); toast({ variant: "success", description: "수집 설정을 저장했습니다." }); }
    catch { await query.refetch(); toast({ variant: "error", description: "수집 설정을 변경하지 못했습니다. 채널 승인·전체 자동 수집 승인·최신 상태를 확인해 주세요." }); }
    finally { setBusy(false); }
  };
  if (channel.channelRole !== "approved_kirinuki") return <p className="text-sm text-muted-foreground">공식 영상은 플레이리스트 가져오기로 수집합니다.</p>;
  return <section aria-label="채널 자동 수집 설정" className="space-y-3 rounded-lg border p-3">
    <h3 className="font-semibold">자동 수집</h3><p className="text-sm text-muted-foreground">채널 승인과 별도로 시작합니다. 자동 수집을 중지해도 URL 등록과 플레이리스트 가져오기는 가능합니다.</p>
    {query.isError ? <Button variant="outline" onClick={() => void query.refetch()}>수집 설정 다시 불러오기</Button> : query.isLoading ? <p>수집 설정 확인 중…</p> : !monitor ? <Button disabled={busy || !channel.active || channel.verificationStatus !== "approved"} onClick={() => void run(() => createOtwPlayChannelMonitor({ externalChannelId: channel.externalChannelId }))}>이 채널 자동 수집 시작</Button> : <>
      <p className="text-sm">{monitor.status === "active" ? "수집 중" : "수집 중지"} · 미처리 {monitor.pendingCandidateCount}개 · 마지막 확인 {monitor.lastCheckedAt ? new Date(monitor.lastCheckedAt).toLocaleString("ko-KR") : "미확인"}</p>
      {monitor.lastErrorCode && <p role="alert" className="text-sm">수집 확인 필요: {monitor.lastErrorCode}</p>}
      <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void run(() => updateOtwPlayChannelMonitor(monitor.id, { expectedVersion: monitor.version, status: monitor.status === "active" ? "paused" : "active" }))}>{monitor.status === "active" ? "자동 수집 중지" : "자동 수집 재개"}</Button><Button variant="outline" disabled={busy || monitor.status === "active"} onClick={() => void run(() => deleteOtwPlayChannelMonitor(monitor.id, { expectedVersion: monitor.version }))}>중지한 수집 설정 삭제</Button></div>
      <label className="text-sm">최근 영상 가져올 개수 <input aria-label="최근 영상 가져올 개수" className="w-20 rounded border bg-background p-2" type="number" min={1} max={20} value={count} onChange={e => setCount(e.target.value)} /></label><Button variant="outline" disabled={busy || monitor.status !== "active" || !Number.isInteger(Number(count)) || Number(count) < 1 || Number(count) > 20} onClick={() => void run(() => backfillOtwPlayChannelMonitor(monitor.id, { count: Number(count) }))}>최근 영상 가져오기</Button>
    </>}
  </section>;
}
