import type { OtwPlayBroadcastMetadata } from "@contracts/otw-play";

export const emptySubmissionBroadcast = (): OtwPlayBroadcastMetadata => ({
  performedOn: null, dateEvidence: null, originalUrl: null, extent: null,
});
