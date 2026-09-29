import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { aiBatchStatusLabels, type AiBatchSelection } from "@contracts/otw-play-ai-batch";
import { Button } from "@/shared/ui/button";
import { SelectField } from "@/shared/ui/select-field";
import { useConfirmation } from "@/shared/lib/confirmation";
import { listAiBatches, previewAiBatch, retryAiBatch, startAiBatch } from "../../api/ai-batch";

export function AiBatchPanel({ selection, allSelected, active, busy, setBusy, onToggleAll, onStarted }: {
  selection: AiBatchSelection | null; allSelected: boolean; active: boolean; busy: boolean; setBusy: (busy: boolean) => void;
  onToggleAll: () => void; onStarted: () => void;
}) {
  const confirm = useConfirmation(), client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const request = useRef<{ selection: string; key: string } | null>(null);
  const batches = useQuery({ queryKey: ["otw-play-ai-batches"], queryFn: listAiBatches, enabled: active, retry: false });
  const batchId = selectedBatch ?? batches.data?.data[0]?.id;
  const batch = batches.data?.data.find(item => item.id === batchId);
  const start = async () => {
    if (!selection) return;
    const snapshot = structuredClone(selection);
    setBusy(true); setError(null);
    try {
      const key = JSON.stringify(snapshot);
      if (request.current?.selection !== key) {
        const preview = await previewAiBatch(snapshot);
        if (!preview.data.count) { setError("처리 가능한 미검수 영상이 없습니다. 이미 진행 중이거나 변경된 항목은 제외됩니다."); return; }
        if (!await confirm({ title: `${preview.data.count}개 영상의 AI 초안을 준비할까요?`, description: "기존 검수값을 보존합니다. 페이지를 닫아도 분석·저장은 계속되며, 검수 완료와 카탈로그 등록은 직접 진행합니다. 실행 시점에 변경된 후보는 제외됩니다.", confirmLabel: "AI 분석·초안 저장" })) return;
        request.current = { selection: key, key: crypto.randomUUID() };
      }
      const result = await startAiBatch(snapshot, request.current!.key).finally(() => client.resetQueries({ queryKey: ["otw-play-ai-draft"] }));
      request.current = null;
      setSelectedBatch(result.data.id); onStarted();
      await client.invalidateQueries({ queryKey: ["otw-play-ai-batches"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "일괄 요청에 실패했습니다.");
      await client.invalidateQueries({ queryKey: ["otw-play-ai-batches"] });
    }
    finally { setBusy(false); }
  };
  return <section aria-label="일괄 AI 검수 초안" className="space-y-4 rounded-lg border p-4">
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">AI 검수 초안</h3>
        <p className="text-xs leading-5 text-muted-foreground">전체 선택은 아직 불러오지 않은 영상도 포함합니다. 초안은 미검수로 저장되며, 기존 입력은 보존합니다.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 [&>button]:min-h-11 [&>button]:w-full sm:[&>button]:min-h-9 sm:[&>button]:w-auto">
      <Button variant="outline" disabled={busy} onClick={onToggleAll}>{allSelected ? "전체 선택 해제" : "현재 필터 전체 대상 선택"}</Button>
      <Button disabled={busy || !selection} onClick={() => void start()}>{busy ? "요청 확인 중…" : allSelected ? "전체 대상 AI 분석·초안 저장" : `선택 ${selection && "candidates" in selection ? selection.candidates.length : 0}개 AI 분석·초안 저장`}</Button>
      </div>
    </div>
    {(error || batches.isError) && <p role="alert">{error ?? "AI 처리 상태를 불러오지 못했습니다."} <Button variant="link" onClick={() => { void batches.refetch(); }}>다시 불러오기</Button></p>}
    {Boolean(batches.data?.data.length) && <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
      <label className="flex min-w-0 flex-col gap-2 text-xs font-medium sm:flex-row sm:items-center">요청 이력
      <SelectField className="h-11 w-full min-w-0 sm:h-9 sm:w-auto" aria-label="AI 일괄 요청 이력" value={batchId ?? ""} onValueChange={setSelectedBatch}
      options={batches.data!.data.map(b => ({ value: b.id, label: `${new Date(b.createdAt).toLocaleString("ko-KR")} · ${b.total}개` }))} />
      </label>
    {batch && <>
      <p role="status" className="min-w-0 flex-1 text-xs leading-5 tabular-nums">총 {batch.total}개 · {Object.entries(batch.counts).filter(([, count]) => count > 0).map(([status, count]) => `${aiBatchStatusLabels[status as keyof typeof aiBatchStatusLabels]} ${count}개`).join(" · ")}</p>
      {batch.counts.failed > 0 && <Button variant="outline" disabled={busy} onClick={async () => {
        setBusy(true); setError(null);
        try { await retryAiBatch(batch.id).finally(() => client.resetQueries({ queryKey: ["otw-play-ai-draft"] })); await batches.refetch(); }
        catch { setError("재시도 요청에 실패했습니다."); } finally { setBusy(false); }
      }}>실패 항목 재시도</Button>}
    </>}
    </div>}
  </section>;
}
