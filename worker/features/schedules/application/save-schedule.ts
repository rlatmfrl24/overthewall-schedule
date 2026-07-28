import type { SaveScheduleResult } from "../../../../contracts/schedules";
import type {
  ScheduleActor,
  ScheduleWriteInput,
} from "../domain/schedule";
import type { ScheduleWriteRepository } from "./ports/schedule-write-repository";

export const saveSchedule = (
  repository: ScheduleWriteRepository,
  input: ScheduleWriteInput,
  actor: ScheduleActor,
): Promise<SaveScheduleResult> =>
  repository.saveWithConflictResolution(input, actor);
