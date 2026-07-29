import { parseAutoUpdateRangeDays } from "../../../../contracts/configuration";
import type { ScheduleActor } from "../domain/schedule";
import type {
  ManualAutoUpdatePort,
  ManualAutoUpdateResult,
} from "./ports/manual-auto-update-port";

export type ManualAutoUpdateOutcome =
  | { ok: true; result: ManualAutoUpdateResult }
  | { ok: false; error: unknown };

export class ManualAutoUpdateService {
  private readonly port: ManualAutoUpdatePort;

  constructor(port: ManualAutoUpdatePort) {
    this.port = port;
  }

  async run(actor: ScheduleActor): Promise<ManualAutoUpdateOutcome> {
    try {
      const rangeDaysValue = await this.port.readRangeDays();
      const rangeDays = parseAutoUpdateRangeDays(rangeDaysValue);
      const result = await this.port.run(rangeDays, actor);
      await this.port.recordSuccess(rangeDays, result, actor);
      return { ok: true, result };
    } catch (error) {
      await this.port.recordFailure(error, actor);
      return { ok: false, error };
    }
  }
}
