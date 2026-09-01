const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const X_COMPLIANCE_BATCH_SIZE = 5_000;
export const X_COMPLIANCE_POLL_DELAY_MS = 15 * MINUTE_MS;
export const X_COMPLIANCE_CYCLE_MS = 12 * HOUR_MS;
export const X_COMPLIANCE_REQUEST_COST_MICROS = 5_000;
// Ten paid Compliance API requests per UTC day. At the normal two cycles per
// day this leaves room for create plus multiple status polls without allowing
// a broken state machine to consume the collection budget.
export const X_COMPLIANCE_DAILY_BUDGET_MICROS = 50_000;
export const X_COMPLIANCE_MAX_ATTEMPTS = 5;
export const X_COMPLIANCE_MAX_RETRY_DELAY_MS = 6 * HOUR_MS;

export type XComplianceStorageUrlValidation =
  | { ok: true; url: string }
  | { ok: false; code: string; detail: string };

export const validateXComplianceStorageUrl = (
  value: string | null,
): XComplianceStorageUrlValidation => {
  if (!value) {
    return {
      ok: false,
      code: "compliance_storage_url_missing",
      detail: "signed_storage_url_missing",
    };
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return {
      ok: false,
      code: "compliance_storage_url_invalid",
      detail: "signed_storage_url_parse_failed",
    };
  }
  if (url.protocol !== "https:" || url.hostname !== "storage.googleapis.com") {
    return {
      ok: false,
      code: "compliance_storage_url_invalid",
      detail: `protocol=${url.protocol};hostname=${url.hostname.slice(0, 253)}`,
    };
  }
  return { ok: true, url: url.toString() };
};

const TERMINAL_ERROR_CODES = new Set([
  "compliance_create_contract_invalid",
  "compliance_provider_job_missing",
  "compliance_storage_url_invalid",
  "compliance_storage_url_missing",
  "x_compliance_http_400",
  "x_compliance_http_401",
  "x_compliance_http_403",
]);

export const isTerminalXComplianceError = (code: string) =>
  TERMINAL_ERROR_CODES.has(code);

export const getXComplianceRetryAt = (
  code: string,
  attempts: number,
  timestamp: number,
) => {
  if (
    isTerminalXComplianceError(code) ||
    attempts >= X_COMPLIANCE_MAX_ATTEMPTS
  ) {
    return null;
  }
  const delay = Math.min(
    X_COMPLIANCE_POLL_DELAY_MS * 2 ** Math.max(0, attempts - 1),
    X_COMPLIANCE_MAX_RETRY_DELAY_MS,
  );
  return timestamp + delay;
};

export const getNextUtcDayStart = (timestamp: number) => {
  const date = new Date(timestamp);
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
  );
};
