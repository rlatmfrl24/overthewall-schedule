import type { ScheduleImageDraft, ScheduleImageDetailRegion } from "../../../../../contracts/schedule-image-import";
import type { ImageScheduleMember } from "../../domain/schedule-image-result";
export type ScheduleImageInput = { bytes: Uint8Array; mediaType: string; members: ImageScheduleMember[];
  details?: { region: ScheduleImageDetailRegion; bytes: Uint8Array; mediaType: string }[] };
export type ImageReadUsage = { inputTokens: number; outputTokens: number; costNanoUsd?: number };
export interface ScheduleImageReader {
  count(image: ScheduleImageInput, signal: AbortSignal): Promise<number>;
  read(image: ScheduleImageInput, signal: AbortSignal): Promise<{ draft: ScheduleImageDraft | null; usage: ImageReadUsage | null }>;
}
export interface ScheduleImageBudget {
  reserve(actorId: string, now: number): Promise<string | null>;
  start(id: string): Promise<void>;
  settle(id: string, usage: ImageReadUsage): Promise<void>;
  releaseUnstarted(id: string): Promise<void>;
  finishUnknown(id: string): Promise<void>;
}
