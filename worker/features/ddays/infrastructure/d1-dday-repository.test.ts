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
    const values = vi.fn(async () => ({ success: true }));
    const updateWhere = vi.fn(async () => ({ success: true }));
    const set = vi.fn(() => ({ where: updateWhere }));
    const deleteWhere = vi.fn(async () => ({ success: true }));
    const db = {
      select: vi.fn(() => ({
        from: () => ({ orderBy }),
      })),
      insert: vi.fn(() => ({ values })),
      update: vi.fn(() => ({ set })),
      delete: vi.fn(() => ({ where: deleteWhere })),
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
  });

  it("legacy DB의 type column 부재 시 type을 제외한 쓰기로 fallback한다", async () => {
    const createFallbackValues = vi.fn(async () => ({ success: true }));
    const updateFallbackWhere = vi.fn(async () => ({ success: true }));
    const updateFallbackSet = vi.fn(() => ({
      where: updateFallbackWhere,
    }));
    const db = {
      insert: vi
        .fn()
        .mockReturnValueOnce({
          values: vi.fn(async () => {
            throw new Error("no such column: type");
          }),
        })
        .mockReturnValueOnce({ values: createFallbackValues }),
      update: vi
        .fn()
        .mockReturnValueOnce({
          set: () => ({
            where: vi.fn(async () => {
              throw new Error("no such column: type");
            }),
          }),
        })
        .mockReturnValueOnce({ set: updateFallbackSet }),
    } as unknown as DbInstance;
    const repository = new D1DDayRepository(db);

    await expect(repository.create(input)).resolves.toBe(true);
    await expect(repository.update(1, input)).resolves.toBe(true);

    const legacyInput = {
      title: input.title,
      date: input.date,
      description: input.description,
      color: input.color,
    };
    expect(createFallbackValues).toHaveBeenCalledWith(legacyInput);
    expect(updateFallbackSet).toHaveBeenCalledWith(legacyInput);
  });
});
