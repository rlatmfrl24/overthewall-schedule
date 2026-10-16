import type { SiteId } from "./site-definition";

export interface HistoricalContentProvenance { sourceSite: SiteId; sourceRecordId: string }
export interface HistoricalPersonCredit extends HistoricalContentProvenance { name: string }
export type HistoricalJsonValue = string | number | boolean | null | HistoricalJsonValue[] | { [key: string]: HistoricalJsonValue };
/** Read-only imported facts. These records never identify a runnable target job or user. */
export interface HistoricalContentMaterial extends HistoricalContentProvenance {
  kind: "origin" | "event" | "review" | "attempt" | "batch" | "job" | "work" | "approval";
  sourceTable: string;
  values: Record<string,HistoricalJsonValue>;
}
