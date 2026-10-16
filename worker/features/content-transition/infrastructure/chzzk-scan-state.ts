import {contentDispositionRegistry} from "../domain/disposition-registry";

export const chzzkScanStateColumns = {
  observations: [...contentDispositionRegistry.schedule_broadcast_observations.values, "content_access"],
  assessments: [...contentDispositionRegistry.schedule_day_assessments.values, "content_access"],
} as const;
export type ChzzkScanState = Record<keyof typeof chzzkScanStateColumns, Array<Record<string, string | number | null>>>;
export function assertChzzkScanState(value: unknown): asserts value is ChzzkScanState {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "assessments,observations") throw new Error("Invalid CHZZK expected state");
  for (const [key, columns] of Object.entries(chzzkScanStateColumns)) {
    const rows = (value as Record<string, unknown>)[key];
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).sort().join(",") !== [...columns].sort().join(",") || Object.values(row).some(field => field !== null && typeof field !== "string" && typeof field !== "number"))) throw new Error("Invalid CHZZK expected row");
  }
}
export function chzzkScanState(memberUids: number[]) {
  const row = (fields: readonly string[]) => `json_object(${fields.flatMap(field => [`'${field}'`, `a."${field}"`]).join(",")})`;
  return {
    sql: `json_object('observations',json((SELECT json_group_array(json(value)) FROM (SELECT ${row(chzzkScanStateColumns.observations)} value FROM schedule_broadcast_observations a WHERE a.member_uid IN (SELECT value FROM json_each(?)) ORDER BY a.vod_id))),
      'assessments',json((SELECT json_group_array(json(value)) FROM (SELECT ${row(chzzkScanStateColumns.assessments)} value FROM schedule_day_assessments a WHERE a.member_uid IN (SELECT value FROM json_each(?)) ORDER BY a.member_uid,a.date))))`,
    bindings: [JSON.stringify(memberUids), JSON.stringify(memberUids)],
  };
}
