import type { NoticeCommand } from "../../notices/commands";
import { contentDispositionRegistry } from "../domain/disposition-registry";
import { contentRowMovedSql } from "./content-retention";

export const editableNoticeSql = (alias: string) => `${alias}.content_access='normal' AND NOT (${contentRowMovedSql("notices", alias)})`;
export const noticeColumns = [...contentDispositionRegistry.notices.values, ...Object.keys(contentDispositionRegistry.notices.json), "content_access"];
export function noticeMutationState(command: NoticeCommand) {
  const where = command.action === "feature" ? editableNoticeSql("n") : command.action === "create" ? "0" : "n.id=?";
  const bindings = command.action === "update" || command.action === "delete" ? [command.id] : [];
  const state = `(SELECT json_group_array(json(value)) FROM (SELECT json_object(${noticeColumns.flatMap(column => [`'${column}'`, `n."${column}"`]).join(",")}) value FROM notices n WHERE ${where} ORDER BY n.id))`;
  return { state, bindings };
}
