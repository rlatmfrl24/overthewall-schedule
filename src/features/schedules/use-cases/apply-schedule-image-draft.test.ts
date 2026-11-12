import { expect, it, vi } from "vitest";
import { applyScheduleImageDraft, confirmScheduleImageResult, type ImageApplyState } from "./apply-schedule-image-draft";
import type { ApplyScheduleImageGroup } from "@contracts/schedule-image-import";
const input = (id: string): ApplyScheduleImageGroup => ({ operationId:id, memberUid:1, date:"2026-11-12", expected:"[]", changes:[], confirmedDeletedIds:[] });
const state = (id: string): ImageApplyState => ({ request:input(id), state:"ready" });
it("reports_approved_atomic_or_partial_outcome and keeps_unknown_commit_in_confirming_state", async () => {
  const apply = vi.fn().mockResolvedValueOnce({ state:"applied" }).mockRejectedValueOnce(new Error("lost response"));
  const refresh = vi.fn().mockResolvedValue(undefined);
  const result = await applyScheduleImageDraft([state("a"),state("b")], { apply, refresh });
  expect(result.groups.map(g => g.state)).toEqual(["applied","unknown"]);
  expect(result.refresh).toBe("ready");
  const stillUnknown = await confirmScheduleImageResult(result.groups[1], async () => null);
  expect(stillUnknown.state).toBe("unknown");
});
it("retries_failed_groups_without_reapplying_success_or_calling_model", async () => {
  const apply = vi.fn().mockResolvedValue({ state:"applied" }), refresh = vi.fn();
  const result = await applyScheduleImageDraft([{...state("a"),state:"applied"},state("b")], { apply, refresh });
  expect(apply).toHaveBeenCalledTimes(1); expect(apply.mock.calls[0][0].operationId).toBe("b");
  expect(result.groups.map(g=>g.state)).toEqual(["applied","applied"]);
});
it("refresh_failure_retries_only_reads", async () => {
  const apply = vi.fn().mockResolvedValue({ state:"applied" }), refresh = vi.fn().mockRejectedValueOnce(new Error("read failed")).mockResolvedValue(undefined);
  const result = await applyScheduleImageDraft([state("a")], { apply, refresh });
  expect(result.groups[0].state).toBe("applied"); expect(result.refresh).toBe("failed");
  await refresh(); expect(apply).toHaveBeenCalledTimes(1); expect(refresh).toHaveBeenCalledTimes(2);
});
