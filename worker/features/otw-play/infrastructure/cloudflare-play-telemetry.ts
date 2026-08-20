import type {
  PlayTelemetryEvent,
  PlayTelemetryWriter,
} from "../application/ports/play-telemetry";

const SAFE_VALUE = /^[A-Za-z0-9._:-]{1,128}$/u;

const safeSlot = (value: string | undefined | null) =>
  value && SAFE_VALUE.test(value) ? value : "";

const stableHash = (value: string) => {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const shouldWritePlayCustomLog = (event: PlayTelemetryEvent) =>
  event.event !== "play.catalog.read" ||
  event.status >= 400 ||
  stableHash(event.requestId) % 10 === 0;

export const toPlayAnalyticsDataPoint = (event: PlayTelemetryEvent) => ({
  indexes: [`${event.event}|${event.routeId}`.slice(0, 96)],
  blobs: [
    event.event,
    safeSlot(event.routeId),
    event.trigger,
    event.cacheStatus ?? "",
    safeSlot(event.errorCode),
    safeSlot(event.resourceType),
    safeSlot(event.resourceId),
    safeSlot(event.transition),
    safeSlot(event.requestId),
    safeSlot(event.cfRay),
  ],
  doubles: [
    event.status,
    Math.max(0, event.durationMs),
    event.d1RowsRead ?? -1,
    event.d1RowsWritten ?? -1,
    1,
  ],
});

export class CloudflarePlayTelemetryWriter implements PlayTelemetryWriter {
  private readonly dataset?: AnalyticsEngineDataset;

  constructor(dataset?: AnalyticsEngineDataset) {
    this.dataset = dataset;
  }

  write(event: PlayTelemetryEvent): void {
    try {
      this.dataset?.writeDataPoint(toPlayAnalyticsDataPoint(event));
    } catch {
      // Telemetry must never change the authoritative application outcome.
    }

    if (!shouldWritePlayCustomLog(event)) return;
    const log = {
      schemaVersion: event.schemaVersion,
      event: event.event,
      occurredAt: event.occurredAt,
      requestId: event.requestId,
      cfRay: event.cfRay,
      routeId: event.routeId,
      trigger: event.trigger,
      status: event.status,
      durationMs: event.durationMs,
      cacheStatus: event.cacheStatus,
      d1RowsRead: event.d1RowsRead,
      d1RowsWritten: event.d1RowsWritten,
      ...(event.resourceType ? { resourceType: event.resourceType } : {}),
      ...(event.resourceId && SAFE_VALUE.test(event.resourceId)
        ? { resourceId: event.resourceId }
        : {}),
      ...(event.transition ? { transition: safeSlot(event.transition) } : {}),
      ...(event.errorCode ? { errorCode: safeSlot(event.errorCode) } : {}),
    };
    if (event.status >= 500) console.error(log);
    else if (event.status >= 400) console.warn(log);
    else console.info(log);
  }
}
