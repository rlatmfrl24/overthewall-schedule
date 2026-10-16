import type { SiteId } from "@contracts/site-definition";
import { ContentWriteError, contentRowMovedSql } from "../../content-access";
import type { NoticeCommand } from "../domain/notice-command";

const editable = (alias: string) => `${alias}.content_access='normal' AND NOT (${contentRowMovedSql("notices", alias)})`;

export async function commitNoticeMutation(db: D1Database, site: SiteId, command: NoticeCommand, statements: D1PreparedStatement[]): Promise<D1Result[]> {
  if (command.action !== "create") {
    const row = await db.prepare(`SELECT content_access,${contentRowMovedSql("notices", "n")} moved FROM notices n WHERE id=?`).bind(command.id).first<{ content_access: string; moved: number }>();
    if (row && (row.content_access !== "normal" || row.moved)) throw new ContentWriteError("CONTENT_MOVED", "luvdia");
  }
  const where = command.action === "feature" ? editable("n") : command.action === "create" ? "0" : "n.id=?";
  const bindings = command.action === "update" || command.action === "delete" ? [command.id] : [];
  const state = `(SELECT json_group_array(json(value)) FROM (SELECT json_object('id',n."id",'content',n."content",'url',n."url",'thumbnail_url',n."thumbnail_url",'type',n."type",'publisher_type',n."publisher_type",'publisher_member_uid',n."publisher_member_uid",'is_active',n."is_active",'is_home_visible',n."is_home_visible",'started_at',n."started_at",'ended_at',n."ended_at",'created_at',n."created_at",'links',n."links",'image_urls',n."image_urls",'related_member_uids',n."related_member_uids",'historical_related_people',n."historical_related_people",'content_access',n."content_access") value FROM notices n WHERE ${where} ORDER BY n.id))`;
  const expected = await db.prepare(`SELECT ${state} state`).bind(...bindings).first<string>("state");
  const chosen = command.action === "create" ? "1" : `EXISTS(SELECT 1 FROM notices n WHERE id=? AND ${editable("n")})`;
  const uids = command.action === "create" || command.action === "update" ? command.input.relatedMemberUids : [];
  const guard = db.prepare(`SELECT iif(${state}=? AND ${chosen} AND (SELECT count(*) FROM members WHERE uid IN (SELECT value FROM json_each(?)) AND (is_deprecated IS NULL OR is_deprecated=0))=?,1,json('notice_expected_state_conflict'))`)
    .bind(...bindings, expected, ...(command.action === "create" ? [] : [command.id]), JSON.stringify(uids), uids.length);
  try {
    return (await db.batch([guard, ...statements])).slice(1);
  } catch (error) {
    if (String(error).includes("malformed JSON")) throw new ContentWriteError("CONTENT_CONFLICT", site);
    throw error;
  }
}
