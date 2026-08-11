import { describe, expect, it } from "vitest";
import { normalizeOtwPlaySearchText } from "./search-normalization";

describe("OTW Play search normalization", () => {
  it.each([
    ["  사건의   지평선  ", "사건의 지평선"],
    ["「ｶﾀｶﾅ・ソング」", "カタカナ ソング"],
    ["Ｆｌｏｗｅｒ　Ｄａｎｃｅ！", "flower dance"],
    ["①st ＣＯＶＥＲ", "1st cover"],
  ])("normalizes multilingual and compatibility text: %s", (value, expected) => {
    expect(normalizeOtwPlaySearchText(value)).toBe(expected);
  });

  it("produces the same key when only whitespace and punctuation differ", () => {
    const variants = [
      "사건의 지평선",
      "  사건의--지평선! ",
      "사건의／지평선",
      "사건의   지평선",
    ];

    expect(new Set(variants.map(normalizeOtwPlaySearchText))).toEqual(
      new Set(["사건의 지평선"]),
    );
  });

  it("does not translate or transliterate titles", () => {
    expect(normalizeOtwPlaySearchText("夜に駆ける")).toBe("夜に駆ける");
    expect(normalizeOtwPlaySearchText("별의 노래")).toBe("별의 노래");
  });

  it("returns an empty key for punctuation and whitespace only", () => {
    expect(normalizeOtwPlaySearchText("  『――！』  ")).toBe("");
  });
});
