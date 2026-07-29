import { describe, expect, it } from "vitest";
import { hasProtectedLocalSeedData } from "./d1-seed-guard.mjs";

describe("hasProtectedLocalSeedData", () => {
  it("완전히 빈 DB에서만 비강제 seed를 허용한다", () => {
    expect(
      hasProtectedLocalSeedData({ destructive_row_count: 0 }),
    ).toBe(false);
    expect(
      hasProtectedLocalSeedData({ destructive_row_count: 18 }),
    ).toBe(true);
  });

  it("보호 상태를 읽지 못하면 삭제 가능성을 열지 않는다", () => {
    expect(hasProtectedLocalSeedData({})).toBe(true);
    expect(
      hasProtectedLocalSeedData({ destructive_row_count: "invalid" }),
    ).toBe(true);
  });
});
