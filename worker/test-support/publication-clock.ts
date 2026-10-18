export function createPublicationClock(database: D1Database) {
  // Control only D1's clock input; publication predicates and writes stay native.
  const db = new Proxy(database, { get(target, property) {
    if (property === "prepare") return (sql: string) => target.prepare(sql.replaceAll("unixepoch()", "(SELECT epoch FROM test_publication_clock WHERE id=1)"));
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  return {
    db,
    async setTime(nowMs: number) {
      await database.prepare("CREATE TABLE IF NOT EXISTS test_publication_clock(id INTEGER PRIMARY KEY CHECK(id=1),epoch INTEGER NOT NULL)").run();
      await database.prepare("INSERT OR REPLACE INTO test_publication_clock(id,epoch) VALUES(1,?)").bind(Math.floor(nowMs / 1000)).run();
    },
  };
}
