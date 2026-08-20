export const PLAY_TELEMETRY_EVENTS = [
  "play.catalog.read",
  "play.proposal.submitted",
  "play.proposal.approved",
  "play.proposal.rejected",
  "play.catalog.published",
  "play.catalog.withdrawn",
  "play.catalog.updated",
  "play.source.unavailable",
  "play.source.recovered",
  "play.youtube.verify_failed",
  "play.concurrent_write_conflict",
  "play.release.updated",
  "play.request.failed",
] as const;

export type PlayTelemetryEventName = (typeof PLAY_TELEMETRY_EVENTS)[number];
export type PlayTelemetryCacheStatus = "hit" | "miss" | "bypass" | null;
export type PlayTelemetryTrigger =
  | "GET"
  | "HEAD"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "scheduled";

export interface PlayTelemetryEvent {
  schemaVersion: 1;
  event: PlayTelemetryEventName;
  occurredAt: string;
  requestId: string;
  cfRay: string | null;
  routeId: string;
  trigger: PlayTelemetryTrigger;
  status: number;
  durationMs: number;
  cacheStatus: PlayTelemetryCacheStatus;
  d1RowsRead: number | null;
  d1RowsWritten: number | null;
  resourceType?: string;
  resourceId?: string;
  transition?: string;
  errorCode?: string;
}

export interface PlayTelemetryWriter {
  write(event: PlayTelemetryEvent): void;
}

export class NoopPlayTelemetryWriter implements PlayTelemetryWriter {
  write(event: PlayTelemetryEvent): void {
    void event;
  }
}

export const createPlayTelemetryEvent = (
  value: Omit<PlayTelemetryEvent, "schemaVersion" | "occurredAt"> & {
    occurredAt?: string;
  },
): PlayTelemetryEvent => ({
  schemaVersion: 1,
  occurredAt: value.occurredAt ?? new Date().toISOString(),
  ...value,
});
