import type { AutoUpdateRunResultDto } from "../../../../../contracts/operations";
import type { ScheduleActor } from "../../domain/schedule";

export type ManualAutoUpdateResult = Omit<
  AutoUpdateRunResultDto,
  "success"
>;

export interface ManualAutoUpdatePort {
  readRangeDays(): Promise<string | null>;
  run(
    rangeDays: number,
    actor: ScheduleActor,
  ): Promise<ManualAutoUpdateResult>;
  recordSuccess(
    rangeDays: number,
    result: ManualAutoUpdateResult,
    actor: ScheduleActor,
  ): Promise<void>;
  recordFailure(error: unknown, actor: ScheduleActor): Promise<void>;
}
