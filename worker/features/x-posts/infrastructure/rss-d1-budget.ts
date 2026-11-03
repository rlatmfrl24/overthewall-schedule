// No quota is spent observing the invocation; only RSS conflict recovery consults this counter.
const budgets = new WeakMap<object, { calls: number; conflicted: boolean }>();

export function trackRssD1Calls(database: D1Database): D1Database {
  const budget = { calls: 0, conflicted: false };
  const originals = new WeakMap<object, D1PreparedStatement>();
  const statement = (source: D1PreparedStatement): D1PreparedStatement => {
    const proxy = new Proxy(source, { get(target, key) {
      if (key === "bind") return (...args: unknown[]) => statement(target.bind(...args));
      const value = Reflect.get(target, key, target);
      if (["all", "first", "run", "raw"].includes(String(key))) return (...args: unknown[]) => { budget.calls++; return value.apply(target,args); };
      return typeof value === "function" ? value.bind(target) : value;
    } });
    originals.set(proxy,source);
    return proxy;
  };
  const wrap = <T extends D1Database | D1DatabaseSession>(source: T): T => {
    const proxy = new Proxy(source, { get(target,key) {
      if(key==='prepare')return (sql:string)=>statement(target.prepare(sql));
      if(key==='batch')return (statements:D1PreparedStatement[])=>{budget.calls++;return target.batch(statements.map(item=>originals.get(item) ?? item));};
      if(key==='withSession')return (...args:Parameters<D1Database['withSession']>)=>wrap((target as D1Database).withSession(...args));
      const value=Reflect.get(target,key,target);
      if((key==='exec'||key==='dump') && typeof value==='function')return (...args:unknown[])=>{budget.calls++;return value.apply(target,args);};
      return typeof value==='function'?value.bind(target):value;
    } });
    budgets.set(proxy,budget);
    return proxy;
  };
  return wrap(database);
}

export function noteRssD1Conflict(db: object) { const budget=budgets.get(db); if(budget)budget.conflicted=true; }
export function rssD1RetryHasRoom(db: object, requiredCalls: number) {
  const budget=budgets.get(db);
  return !budget?.conflicted || budget.calls+requiredCalls<=50;
}
