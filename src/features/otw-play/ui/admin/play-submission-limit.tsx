import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSettings, updateSettings, isOtwPlaySubmissionDailyLimitValue } from "@/features/configuration";
import { useUnsavedChanges } from "@/shared/lib/unsaved-changes";
import { queryKeys } from "@/shared/query/query-keys";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

export function PlaySubmissionLimit() {
  const client = useQueryClient();
  const settings = useQuery({ queryKey: queryKeys.settings.detail(), queryFn: fetchSettings, staleTime: 30_000 });
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const current = settings.data?.otw_play_submission_daily_limit;
  const value = draft ?? current ?? "";
  const dirty = draft !== null && draft !== current;
  useUnsavedChanges(dirty);
  const save = async () => {
    if (!isOtwPlaySubmissionDailyLimitValue(value)) {
      setMessage({ error: true, text: "회원 제안 일일 한도는 1~100 사이의 정수로 입력하세요." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await updateSettings({ otw_play_submission_daily_limit: value });
      const confirmed = await fetchSettings();
      client.setQueryData(queryKeys.settings.detail(), confirmed);
      if (confirmed.otw_play_submission_daily_limit !== value) throw new Error("readback mismatch");
      setDraft(null);
      setMessage({ error: false, text: "회원 제안 일일 한도를 저장했습니다." });
    } catch {
      setMessage({ error: true, text: "저장 결과를 확인하지 못했습니다. 입력을 유지했습니다. 다시 확인해 주세요." });
    } finally { setBusy(false); }
  };
  return <section className="space-y-3 rounded-lg border bg-card p-5" aria-labelledby="play-submission-settings">
    <h2 id="play-submission-settings" className="font-semibold">회원 곡 제안</h2>
    <p className="text-sm text-muted-foreground">회원 한 명이 하루에 제출할 수 있는 곡 제안 수입니다. 저장하면 반영됩니다.</p>
    <div className="flex flex-wrap items-end gap-3"><div className="space-y-1"><Label htmlFor="play-submission-limit">일일 제안 한도</Label><Input id="play-submission-limit" type="number" min={1} max={100} className="w-28" value={value} disabled={busy || !settings.data} onChange={event => setDraft(event.target.value)} /></div>
      <Button disabled={busy || !dirty || !settings.data} onClick={() => void save()}>{busy ? "저장 중…" : "한도 저장"}</Button>
    </div>
    {settings.isError && <p role="alert">설정을 불러오지 못했습니다. <Button variant="link" onClick={() => void settings.refetch()}>다시 조회</Button></p>}
    {message && <p role={message.error ? "alert" : "status"} className="text-sm">{message.text}</p>}
  </section>;
}
