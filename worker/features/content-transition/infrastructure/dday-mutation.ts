import type { DDayCommand } from "../../ddays/commands";
import { contentDispositionRegistry } from "../domain/disposition-registry";
import { contentRowMovedSql } from "./content-retention";

export const ddayColumns = [...contentDispositionRegistry.ddays.values, "content_access"];
export const editableDDaySql = (alias: string) => `${alias}.content_access='normal' AND NOT (${contentRowMovedSql("ddays", alias)})`;
export function ddayMutationState(command: DDayCommand) {
  return { sql: command.action === "create" ? "'[]'" : `(SELECT json_group_array(json_object(${ddayColumns.flatMap(column => [`'${column}'`, `d."${column}"`]).join(",")})) FROM ddays d WHERE id=?)`, bindings: command.action === "create" ? [] : [command.id] };
}
