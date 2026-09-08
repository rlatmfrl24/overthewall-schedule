import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { OtwPlayChannelMonitorDto } from "@contracts/otw-play";
import { fetchSettings, updateSettings } from "@/features/configuration";
import { queryKeys } from "@/shared/query/query-keys";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { useToast } from "@/shared/ui/toast";
import { fetchOtwPlayChannelMonitors, updateOtwPlayChannelMonitor } from "../../api/admin";

export function PlayAutomationControl({ monitors }: { monitors: OtwPlayChannelMonitorDto[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const settings = useQuery({ queryKey: queryKeys.settings.detail(), queryFn: fetchSettings, staleTime: 30_000 });
  const paused = settings.data?.otw_play_automation_paused === "true";
  const activeCount = monitors.filter((monitor) => monitor.status === "active").length;

  const changePause = async () => {
    setBusy(true);
    try {
      const current = await fetchOtwPlayChannelMonitors();
      for (const monitor of current) {
        if (monitor.status === "active") {
          await updateOtwPlayChannelMonitor(monitor.id, { expectedVersion: monitor.version, status: "paused" });
        }
      }
      const confirmed = await fetchOtwPlayChannelMonitors();
      if (confirmed.some((monitor) => monitor.status === "active")) {
        throw new Error("Monitor state changed during pause");
      }
      await updateSettings({ otw_play_automation_paused: paused ? "false" : "true" });
      const confirmedSettings = await fetchSettings();
      if ((confirmedSettings.otw_play_automation_paused === "true") !== !paused) {
        throw new Error("Automation pause readback does not match the requested state");
      }
      queryClient.setQueryData(queryKeys.settings.detail(), confirmedSettings);
      toast({ variant: "success", description: paused
        ? "자동화 일시 중지를 해제했습니다. 필요한 채널의 감시를 개별적으로 재개해 주세요."
        : "Play 자동화를 일시 중지했습니다. 기존 후보 검수와 데이터 보존 정리는 계속합니다." });
    } catch {
      toast({ variant: "error", description: "전체 설정 변경을 완료하지 못했습니다. 이미 중지된 채널은 유지되며 최신 상태를 확인한 뒤 다시 시도해 주세요." });
    } finally {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.otwPlay.channelMonitors() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.operations.all }),
      ]);
      setBusy(false);
    }
  };

  return <section className="space-y-2 rounded-xl border p-3" aria-labelledby="play-automation-title">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 id="play-automation-title" className="font-semibold">Play 자동화 운영</h3>
      <Badge variant="outline">{settings.isError ? "상태 확인 실패" : !settings.data ? "확인 중" : paused ? "일시 중지" : "자동화 허용"}</Badge>
    </div>
    <p className="text-sm text-muted-foreground">전체 일시 중지는 채널 업로드 조회와 자동 수집·소스 점검을 멈춥니다. 기존 곡·후보 검수와 데이터 보존 정리는 유지합니다.</p>
    {paused && <p role="status" className="text-sm">재개 시 채널 감시를 개별적으로 켜야 합니다.</p>}
    {!paused && <p className="text-sm text-muted-foreground">감시 중인 채널 {activeCount}개</p>}
    <Button variant="outline" disabled={busy || !settings.data || settings.isError} onClick={() => void changePause()}>
      {busy ? "상태 변경 중…" : paused ? "자동화 일시 중지 해제" : "Play 자동화 전체 일시 중지"}
    </Button>
  </section>;
}
