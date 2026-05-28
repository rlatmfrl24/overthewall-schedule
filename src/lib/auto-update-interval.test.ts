import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTO_UPDATE_INTERVAL_HOURS,
  isAutoUpdateIntervalHours,
  normalizeAutoUpdateIntervalHours,
  normalizeXCollectionIntervalHours,
  parseAutoUpdateIntervalHours,
  parseXCollectionIntervalHours,
  isXCollectionIntervalHours,
} from "./auto-update-interval";

describe("auto update interval helpers", () => {
  it("허용된 자동 수집 주기만 유효하게 본다", () => {
    expect(isAutoUpdateIntervalHours("1")).toBe(true);
    expect(isAutoUpdateIntervalHours("6")).toBe(true);
    expect(isAutoUpdateIntervalHours("12")).toBe(true);
    expect(isAutoUpdateIntervalHours("24")).toBe(true);
    expect(isAutoUpdateIntervalHours("2")).toBe(false);
    expect(isAutoUpdateIntervalHours("4")).toBe(false);
  });

  it("기존에 저장된 삭제된 주기나 누락값은 기본값으로 정규화한다", () => {
    expect(normalizeAutoUpdateIntervalHours("2")).toBe(
      DEFAULT_AUTO_UPDATE_INTERVAL_HOURS,
    );
    expect(normalizeAutoUpdateIntervalHours("4")).toBe(
      DEFAULT_AUTO_UPDATE_INTERVAL_HOURS,
    );
    expect(normalizeAutoUpdateIntervalHours(null)).toBe(
      DEFAULT_AUTO_UPDATE_INTERVAL_HOURS,
    );
    expect(parseAutoUpdateIntervalHours("2")).toBe(
      Number(DEFAULT_AUTO_UPDATE_INTERVAL_HOURS),
    );
  });

  it("X 게시글 수집 주기도 같은 허용 주기와 기본값을 사용한다", () => {
    expect(isXCollectionIntervalHours("1")).toBe(true);
    expect(isXCollectionIntervalHours("6")).toBe(true);
    expect(isXCollectionIntervalHours("12")).toBe(true);
    expect(isXCollectionIntervalHours("24")).toBe(true);
    expect(isXCollectionIntervalHours("3")).toBe(false);
    expect(normalizeXCollectionIntervalHours("3")).toBe(
      DEFAULT_AUTO_UPDATE_INTERVAL_HOURS,
    );
    expect(parseXCollectionIntervalHours("12")).toBe(12);
  });
});
