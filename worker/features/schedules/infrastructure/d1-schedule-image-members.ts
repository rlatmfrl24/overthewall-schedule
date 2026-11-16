import type { SiteId } from "@contracts/site-definition";
import { publicationHiddenSql } from "../../content-access";
import type { ImageScheduleMember } from "../domain/schedule-image-result";

export async function readScheduleImageMembers(db: D1Database, site: SiteId): Promise<ImageScheduleMember[]> {
  return (await db.prepare(`SELECT uid,name,code,url_twitter FROM members WHERE content_access='normal' AND COALESCE(is_deprecated,0)=0 AND NOT (${publicationHiddenSql("members","members",site)}) ORDER BY uid`).all<ImageScheduleMember>()).results;
}
