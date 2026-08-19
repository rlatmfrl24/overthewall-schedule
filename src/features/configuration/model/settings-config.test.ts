import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTO_UPDATE_INTERVAL_HOURS,
  DEFAULT_X_COLLECTION_INTERVAL_HOURS,
  isAutoUpdateIntervalHours,
  normalizeAutoUpdateIntervalHours,
  normalizeAdminSettings,
  normalizeXCollectionIntervalHours,
  parseSettingsUpdatePayload,
  parseAutoUpdateIntervalHours,
  parseXCollectionIntervalHours,
  isXCollectionIntervalHours,
  isOtwPlaySubmissionDailyLimitValue,
  normalizeOtwPlaySubmissionDailyLimit,
} from "./settings-config";

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

  it("X 게시글 수집 주기는 2시간 이상만 허용하고 기본값도 2시간을 사용한다", () => {
    expect(isXCollectionIntervalHours("1")).toBe(false);
    expect(isXCollectionIntervalHours("2")).toBe(true);
    expect(isXCollectionIntervalHours("6")).toBe(true);
    expect(isXCollectionIntervalHours("12")).toBe(true);
    expect(isXCollectionIntervalHours("24")).toBe(true);
    expect(isXCollectionIntervalHours("3")).toBe(false);
    expect(normalizeXCollectionIntervalHours("1")).toBe(
      DEFAULT_X_COLLECTION_INTERVAL_HOURS,
    );
    expect(normalizeXCollectionIntervalHours("3")).toBe(
      DEFAULT_X_COLLECTION_INTERVAL_HOURS,
    );
    expect(parseXCollectionIntervalHours("1")).toBe(2);
    expect(parseXCollectionIntervalHours("2")).toBe(2);
    expect(parseXCollectionIntervalHours("12")).toBe(12);
  });
});

describe("settings policy", () => {
  it("OTW Play 회원 제안 일일 제한을 1~100 범위로 검증한다", () => {
    expect(isOtwPlaySubmissionDailyLimitValue("1")).toBe(true);
    expect(isOtwPlaySubmissionDailyLimitValue("100")).toBe(true);
    expect(isOtwPlaySubmissionDailyLimitValue("0")).toBe(false);
    expect(isOtwPlaySubmissionDailyLimitValue("101")).toBe(false);
    expect(isOtwPlaySubmissionDailyLimitValue(" 5 ")).toBe(false);
    expect(normalizeOtwPlaySubmissionDailyLimit(null)).toBe("5");
  });

  it("저장값을 관리자 설정 DTO 기본값으로 정규화한다", () => {
    const { settings } = normalizeAdminSettings({
      auto_update_enabled: "invalid",
      auto_update_interval_hours: "2",
      x_collection_interval_hours: "1",
      youtube_warmup_daily_quota_units: "20000",
    });

    expect(settings).toMatchObject({
      auto_update_enabled: null,
      auto_update_interval_hours: "6",
      live_schedule_auto_fill_enabled: "true",
      x_collection_interval_hours: "2",
      youtube_warmup_enabled: "true",
      youtube_warmup_interval_hours: "1",
      youtube_warmup_daily_quota_units: "10000",
      otw_play_submission_daily_limit: "5",
    });
  });

  it("쓰기 가능한 설정만 검증 후 반환하고 last_run은 제외한다", () => {
    expect(
      parseSettingsUpdatePayload({
        auto_update_enabled: "false",
        auto_update_last_run: "9999999999999",
        x_collection_interval_hours: "24",
        unknown_setting: "ignored",
      }),
    ).toEqual({
      ok: true,
      updates: [
        { key: "auto_update_enabled", value: "false" },
        { key: "x_collection_interval_hours", value: "24" },
      ],
    });
  });

  it("허용 범위를 벗어난 설정값을 거부한다", () => {
    expect(
      parseSettingsUpdatePayload({
        youtube_warmup_daily_quota_units: "0",
      }),
    ).toEqual({
      ok: false,
      error: "Invalid youtube_warmup_daily_quota_units",
    });
    expect(
      parseSettingsUpdatePayload({
        otw_play_submission_daily_limit: "101",
      }),
    ).toEqual({
      ok: false,
      error: "Invalid otw_play_submission_daily_limit",
    });
  });
});
