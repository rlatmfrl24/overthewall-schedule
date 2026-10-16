/** Infrastructure composition only: keep prepared D1 statements inside the
 * existing canonical import/replay transaction, including its receipt. */
export interface CatalogImportProjection {
  isTable(table:string):boolean;
  statements(db:D1Database,images:readonly {table:string;value:Readonly<Record<string,unknown>>}[],now:number):{
    before:D1PreparedStatement[];after:D1PreparedStatement[];
  };
}
