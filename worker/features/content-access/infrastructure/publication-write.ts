import type { SiteId } from "@contracts/site-definition";
import { getHiddenMemberCodes } from "@contracts/site-publication";
import { publicationHiddenSql } from "./publication-access";

export async function publicationMemberHidden(db: D1Database, site: SiteId, uid: number): Promise<boolean> {
  if (!getHiddenMemberCodes(site, Date.now()).length) return false;
  return Boolean(await db.prepare(`SELECT 1 FROM members m WHERE m.uid=? AND ${publicationHiddenSql("members", "m", site)}`).bind(uid).first());
}

/** Check in the owning D1 transaction: a response started before midnight grants no later write authority. */
export async function commitPublicationBatch(db: D1Database, site: SiteId, memberUids: readonly number[], statements: D1PreparedStatement[]): Promise<D1Result[]> {
  if (!statements.length) return [];
  const guards = site !== "otw" || !memberUids.length ? [] : [db.prepare(`SELECT iif(NOT EXISTS(SELECT 1 FROM members m WHERE m.uid IN (SELECT value FROM json_each(?)) AND ${publicationHiddenSql("members", "m", site)}),1,json('site_member_cutover'))`).bind(JSON.stringify(memberUids))];
  return (await db.batch([...guards, ...statements])).slice(guards.length);
}
