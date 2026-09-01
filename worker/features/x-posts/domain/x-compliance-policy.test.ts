import { describe, expect, it } from "vitest";
import {
  getNextUtcDayStart,
  getXComplianceRetryAt,
  validateXComplianceStorageUrl,
  X_COMPLIANCE_DAILY_BUDGET_MICROS,
} from "./x-compliance-policy";

describe("X Compliance budget and retry policy", () => {
  it("caps the workload at ten paid requests per UTC day", () => {
    expect(X_COMPLIANCE_DAILY_BUDGET_MICROS).toBe(50_000);
  });

  it("terminal contract and authentication errors are not retried", () => {
    const timestamp = Date.parse("2026-09-01T12:00:00Z");
    expect(getXComplianceRetryAt(
      "compliance_storage_url_invalid",
      1,
      timestamp,
    )).toBeNull();
    expect(getXComplianceRetryAt(
      "x_compliance_http_401",
      1,
      timestamp,
    )).toBeNull();
  });

  it("accepts only the documented HTTPS Google Storage host", () => {
    expect(validateXComplianceStorageUrl(
      "https://storage.googleapis.com/example/upload?signature=secret",
    )).toMatchObject({ ok: true });
    expect(validateXComplianceStorageUrl(
      "https://storage.googleapis.com.evil.example/upload?signature=secret",
    )).toEqual({
      ok: false,
      code: "compliance_storage_url_invalid",
      detail: "protocol=https:;hostname=storage.googleapis.com.evil.example",
    });
  });

  it("transient failures back off and stop at the retry limit", () => {
    const timestamp = Date.parse("2026-09-01T12:00:00Z");
    expect(getXComplianceRetryAt("x_compliance_http_500", 1, timestamp))
      .toBe(timestamp + 15 * 60_000);
    expect(getXComplianceRetryAt("x_compliance_http_500", 2, timestamp))
      .toBe(timestamp + 30 * 60_000);
    expect(getXComplianceRetryAt("x_compliance_http_500", 5, timestamp))
      .toBeNull();
  });

  it("moves exhausted provider budget to the next UTC day", () => {
    expect(getNextUtcDayStart(Date.parse("2026-09-01T23:59:00Z")))
      .toBe(Date.parse("2026-09-02T00:00:00Z"));
  });
});
