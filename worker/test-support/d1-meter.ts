/** Real local D1 metadata; fixture writes and EXPLAIN stay outside this meter. */
export function meterD1(database: D1Database, cap = Infinity) {
  let bindingCalls = 0;
  let quotaDenials = 0;
  const submitted: Array<{ sql: string; args: unknown[] }> = [];
  const calls: Array<{ method: string; statements: number; completed: boolean }> = [];
  const begin = (method: string, statements: Array<{ sql: string; args: unknown[] }>) => {
    if (bindingCalls >= cap) { quotaDenials++; throw new Error("d1_binding_call_limit"); }
    bindingCalls++;
    submitted.push(...statements);
    const call = { method, statements: statements.length, completed: false };
    calls.push(call);
    return call;
  };
  const entries: Array<{ sql: string; args: unknown[]; rowsRead: number; rowsWritten: number }> = [];
  const originals = new WeakMap<object, { statement: D1PreparedStatement; sql: string; args: unknown[] }>();
  const record = (sql: string, args: unknown[], result: D1Result) => entries.push({ sql, args, rowsRead: result.meta.rows_read, rowsWritten: result.meta.rows_written });
  const wrap = (statement: D1PreparedStatement, sql: string, args: unknown[] = []): D1PreparedStatement => {
    const proxy = new Proxy(statement, { get(target, key) {
      if (key === "bind") return (...values: unknown[]) => wrap(target.bind(...values), sql, values);
      if (key === "all" || key === "run" || key === "first") return async (column?: string) => {
        const call = begin(String(key), [{ sql, args }]);
        const result = await target.all(); record(sql, args, result);
        call.completed = true;
        const row = result.results[0];
        return key !== "first" ? result : column ? row?.[column] ?? null : row ?? null;
      };
      // shortcut: raw metering requires unique column names without columnNames; use a dedicated meter for raw joins.
      if (key === "raw") return async (options?: { columnNames?: boolean }) => {
        const call = begin("raw", [{ sql, args }]);
        const result = await target.all(); record(sql, args, result);
        call.completed = true;
        const rows = result.results.map(row => Object.values(row));
        return options?.columnNames ? [Object.keys(result.results[0] ?? {}), ...rows] : rows;
      };
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    originals.set(proxy, { statement, sql, args });
    return proxy;
  };
  const wrapDatabase = <T extends D1Database | D1DatabaseSession>(database: T): T => new Proxy(database, { get(target, key) {
    if (key === "prepare") return (sql: string) => wrap(target.prepare(sql), sql);
    if (key === "batch") return async (statements: D1PreparedStatement[]) => {
      // Run through the original batch to retain its transaction semantics.
      const originalsForBatch = statements.map(statement => originals.get(statement));
      if (originalsForBatch.some(statement => !statement)) throw new Error("unmetered_batch_statement");
      const call = begin("batch", originalsForBatch.map(statement => statement!));
      const results = await target.batch(statements.map((statement, index) => originalsForBatch[index]?.statement ?? statement));
      results.forEach((result, index) => record(originalsForBatch[index]?.sql ?? "batch", originalsForBatch[index]?.args ?? [], result));
      call.completed = true;
      return results;
    };
    if (key === "withSession") return (...args: Parameters<D1Database["withSession"]>) => wrapDatabase((target as D1Database).withSession(...args));
    if (key === "exec") return async (sql: string) => {
      const call = begin("exec", [{ sql, args: [] }]);
      const result = await (target as D1Database).exec(sql);
      call.completed = true;
      return result;
    };
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  return { db: wrapDatabase(database), entries, submitted, calls, get bindingCalls() { return bindingCalls; }, get quotaDenials() { return quotaDenials; }, summary: () => ({ sqlCount: submitted.length, rowsRead: entries.reduce((n, row) => n + row.rowsRead, 0), rowsWritten: entries.reduce((n, row) => n + row.rowsWritten, 0) }) };
}
