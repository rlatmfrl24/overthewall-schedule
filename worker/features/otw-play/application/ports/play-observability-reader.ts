import type { OtwPlayAdminObservabilityDto } from "@contracts/otw-play";

export interface PlayObservabilityReader {
  read24Hours(): Promise<OtwPlayAdminObservabilityDto>;
}
