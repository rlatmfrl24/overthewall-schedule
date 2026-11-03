import { expect, it } from "vitest";
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
