import { contentDispositionRegistry } from "../domain/disposition-registry";
import { keySql, type ContentTable } from "./capture-graph";

/** Operational expiry only. Intentional removal/redaction keeps its owning write contract. */
export function contentRowHeldSql(table: ContentTable, alias: string = table): string {
  const archived = (contentDispositionRegistry[table].excluded as readonly string[]).includes("content_access")
    ? `${alias}.content_access='admin_archive' OR ` : "";
  return `(${archived}EXISTS(SELECT 1 FROM content_transition_membership held
    JOIN content_transitions transition ON transition.id=held.transition_id
    WHERE transition.local_site=transition.source_site AND transition.phase<>'prepared'
      AND held.row_table='${table}' AND held.row_key=${keySql(table, alias)}))`;
}

export function contentRowMovedSql(table: ContentTable, alias: string = table): string {
  return `EXISTS(SELECT 1 FROM content_transition_membership held
    JOIN content_transitions transition ON transition.id=held.transition_id
    WHERE transition.local_site=transition.source_site AND transition.phase IN ('source_fenced','target_owned','complete')
      AND held.row_table='${table}' AND held.row_key=${keySql(table, alias)})`;
}
