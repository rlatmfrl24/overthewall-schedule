import type { SiteId } from "@contracts/site-definition";
import { contentRowMovedSql } from "./content-retention";
import { publicationHiddenSql } from "./publication-access";
type CollectorTable = "members" | "schedules" | "pending_schedules" | "schedule_candidate_rejections" | "schedule_broadcast_observations" | "schedule_day_assessments";
export const editableCollectorSql = (table: CollectorTable, alias: string = table, siteId: SiteId = "otw") => `${alias}.content_access='normal' AND NOT (${contentRowMovedSql(table,alias)}) AND NOT (${publicationHiddenSql(table,alias,siteId)})`;
