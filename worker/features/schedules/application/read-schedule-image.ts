import { SCHEDULE_IMAGE_LIMITS } from "../../../../contracts/schedule-image-import";
import type { ScheduleImageBudget, ScheduleImageInput, ScheduleImageReader } from "./ports/schedule-image-reader";

export class ScheduleImageError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status=status; }
}
export async function readScheduleImage(reader: ScheduleImageReader, budget: ScheduleImageBudget, image: ScheduleImageInput, actorId: string, signal: AbortSignal) {
  const reservation = await budget.reserve(actorId, Date.now());
  if (!reservation) throw new ScheduleImageError("인식 한도에 도달했거나 다른 인식이 진행 중입니다. 직접 입력과 이미 읽은 일정의 편집·적용은 계속할 수 있습니다.", 429);
  let started = false;
  let settled = false;
  try {
    const tokens = await reader.count(image, signal);
    if (tokens > SCHEDULE_IMAGE_LIMITS.inputTokens) throw new ScheduleImageError("이미지의 입력량이 큽니다. 필요한 부분을 나누어 올려주세요.");
    signal.throwIfAborted();
    await budget.start(reservation);
    started = true;
    const { draft, usage } = await reader.read(image, signal);
    if (usage) { await budget.settle(reservation, usage); settled = true; }
    if (!draft) throw new ScheduleImageError("일정표를 끝까지 읽지 못했거나 100건을 초과했습니다. 원본을 나누어 다시 올려주세요.", 422);
    return draft;
  } finally {
    if (!started) await budget.releaseUnstarted(reservation);
    else if (!settled) await budget.finishUnknown(reservation);
  }
}
