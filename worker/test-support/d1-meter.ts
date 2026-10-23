/** Real local D1 metadata; fixture writes and EXPLAIN stay outside this meter. */
export function meterD1(database: D1Database) {
  const entries: Array<{ sql: string; args: unknown[]; rowsRead: number; rowsWritten: number }> = [];
  const originals = new WeakMap<object, { statement: D1PreparedStatement; sql: string; args: unknown[] }>();
  const record = (sql: string, args: unknown[], result: D1Result) => entries.push({ sql, args, rowsRead: result.meta.rows_read, rowsWritten: result.meta.rows_written });
  const wrap = (statement: D1PreparedStatement, sql: string, args: unknown[] = []): D1PreparedStatement => {
    const proxy = new Proxy(statement, { get(target, key) {
      if (key === "bind") return (...values: unknown[]) => wrap(target.bind(...values), sql, values);
      if (key === "all" || key === "run" || key === "first") return async (column?: string) => {
        const result = await target.all(); record(sql, args, result);
        const row = result.results[0];
        return key !== "first" ? result : column ? row?.[column] ?? null : row ?? null;
      };
      // shortcut: raw metering requires unique column names without columnNames; use a dedicated meter for raw joins.
      if (key === "raw") return async () => {
        const result = await target.all(); record(sql, args, result);
        return result.results.map(row => Object.values(row));
      };
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    originals.set(proxy, { statement, sql, args });
    return proxy;
  };
  const measured = new Proxy(database, { get(target, key) {
    if (key === "prepare") return (sql: string) => wrap(target.prepare(sql), sql);
    if (key === "batch") return async (statements: D1PreparedStatement[]) => {
      // Run through the original batch to retain its transaction semantics.
      const originalsForBatch = statements.map(statement => originals.get(statement));
      const results = await target.batch(statements.map((statement, index) => originalsForBatch[index]?.statement ?? statement));
      results.forEach((result, index) => record(originalsForBatch[index]?.sql ?? "batch", originalsForBatch[index]?.args ?? [], result));
      return results;
    };
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  return { db: measured, entries, summary: () => ({ sqlCount: entries.length, rowsRead: entries.reduce((n, row) => n + row.rowsRead, 0), rowsWritten: entries.reduce((n, row) => n + row.rowsWritten, 0) }) };
}
