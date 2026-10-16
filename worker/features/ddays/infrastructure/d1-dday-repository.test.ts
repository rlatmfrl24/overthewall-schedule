import { describe, expect, it, vi } from "vitest";
import type { DbInstance } from "../../../platform/db";
import { D1DDayRepository } from "./d1-dday-repository";

const input = {
  title: "기념일",
  date: "2026-02-13",
  description: null,
  color: "#31a4a9",
  type: "event",
};

describe("D1 D-Day repository", () => {
  it("조회와 생성·수정·삭제를 persistence adapter에서 수행한다", async () => {
    const rows = [{ id: 1, ...input, created_at: null }];
    const orderBy = vi.fn(async () => rows);
    const statement={toSQL:()=>({sql:'fixture statement',params:[]})};
    const run=vi.fn(async()=>({success:true}));
    const prepared={bind:()=>({run})};
    const values = vi.fn(() => statement);
    const updateWhere = vi.fn(() => statement);
    const set = vi.fn(() => ({ where: updateWhere }));
    const deleteWhere = vi.fn(() => statement);
    const db = {
      select: vi.fn(() => ({
        from: () => ({where:()=>({orderBy})}),
      })),
      insert: vi.fn(() => ({ values })),
      update: vi.fn(() => ({ set })),
      delete: vi.fn(() => ({ where: deleteWhere })),
      $client:{prepare:vi.fn(()=>prepared)},
    } as unknown as DbInstance;
    const repository = new D1DDayRepository(db);

    await expect(repository.list()).resolves.toEqual(rows);
    await expect(repository.create(input)).resolves.toBe(true);
    await expect(repository.update(1, input)).resolves.toBe(true);
    await expect(repository.remove(1)).resolves.toBe(true);

    expect(values).toHaveBeenCalledWith(input);
    expect(set).toHaveBeenCalledWith(input);
    expect(updateWhere).toHaveBeenCalled();
    expect(deleteWhere).toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(3);
  });
});
