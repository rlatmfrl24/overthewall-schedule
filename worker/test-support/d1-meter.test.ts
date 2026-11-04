import { expect, it, vi } from "vitest";
import { meterD1 } from "./d1-meter";

it("counts one D1 binding call for a transactional batch while retaining every statement's rows", async () => {
  const result = { results: [{ n: 1 }], meta: { rows_read: 2, rows_written: 3 } };
  const statement = { bind: () => statement, all: async () => result };
  const meter = meterD1({ prepare: () => statement, batch: async (statements: unknown[]) => statements.map(() => result) } as unknown as D1Database);
  await meter.db.batch([meter.db.prepare("one"), meter.db.prepare("two")]);
  await meter.db.prepare("three").first("n");
  await meter.db.prepare("four").raw();
  expect(meter.bindingCalls).toBe(3);
  expect(meter.summary()).toEqual({ sqlCount: 4, rowsRead: 8, rowsWritten: 12 });
});

it("counts failed batches and session/exec methods, and refuses before executing beyond its cap", async () => {
  const result = {results:[],meta:{rows_read:0,rows_written:0}}, all=vi.fn(async()=>result);
  const statement={bind:()=>statement,all}, batch=vi.fn(async()=>{throw new Error("rollback");}), exec=vi.fn(async()=>({count:1,duration:0}));
  const database={prepare:()=>statement,batch,exec,withSession:()=>({prepare:()=>statement,batch})};
  const meter=meterD1(database as unknown as D1Database,3);
  await expect(meter.db.batch([meter.db.prepare("one"),meter.db.prepare("two")])).rejects.toThrow("rollback");
  await meter.db.withSession().prepare("three").all();
  await meter.db.exec("four");
  await expect(meter.db.prepare("five").run()).rejects.toThrow("d1_binding_call_limit");
  expect(meter.bindingCalls).toBe(3); expect(meter.quotaDenials).toBe(1);
  expect(meter.submitted).toHaveLength(4); expect(meter.calls.map(call=>call.completed)).toEqual([false,true,true]);
  expect(all).toHaveBeenCalledOnce(); expect(exec).toHaveBeenCalledOnce();
});
