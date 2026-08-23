import { describe, expect, it } from "vitest";
import { shouldBlockDestructiveLocalReset } from "./d1-reset-guard.mjs";

describe("shouldBlockDestructiveLocalReset", () => {
  it("기존 로컬 D1을 비강제 reset으로 교체하지 않는다", () => {
    expect(
      shouldBlockDestructiveLocalReset({
        validateOnly: false,
        force: false,
        hasCurrentDatabase: true,
      }),
    ).toBe(true);
  });

  it("명시적 force 또는 신규 로컬 환경에서는 reset을 허용한다", () => {
    expect(
      shouldBlockDestructiveLocalReset({
        validateOnly: false,
        force: true,
        hasCurrentDatabase: true,
      }),
    ).toBe(false);
    expect(
      shouldBlockDestructiveLocalReset({
        validateOnly: false,
        force: false,
        hasCurrentDatabase: false,
      }),
    ).toBe(false);
  });

  it("validate-only는 기존 로컬 D1을 보존하므로 항상 허용한다", () => {
    expect(
      shouldBlockDestructiveLocalReset({
        validateOnly: true,
        force: false,
        hasCurrentDatabase: true,
      }),
    ).toBe(false);
  });
});
