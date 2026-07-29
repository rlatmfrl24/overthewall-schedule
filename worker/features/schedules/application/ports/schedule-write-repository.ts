import type { SaveScheduleResult } from "../../../../../contracts/schedules";
import type {
  ScheduleActor,
  ScheduleWriteInput,
} from "../../domain/schedule";

export interface ScheduleWriteRepository {
  saveWithConflictResolution(
    input: ScheduleWriteInput,
    actor: ScheduleActor,
  ): Promise<SaveScheduleResult>;
  create(input: ScheduleWriteInput, actor: ScheduleActor): Promise<void>;
  update(input: ScheduleWriteInput, actor: ScheduleActor): Promise<void>;
  delete(id: number, actor: ScheduleActor): Promise<void>;
}
