import {
  OTW_PLAY_ADMIN_RELEASE_CONFIRMATIONS,
  type OtwPlayAdminReleaseRequest,
} from "@contracts/otw-play";

export type ReleaseInputResult =
  | { ok: true; value: OtwPlayAdminReleaseRequest }
  | { ok: false; fields: Record<string, string> };

const objectOf = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const hasOnly = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key)) &&
  keys.every((key) => key in value);

const parseFlags = (
  value: unknown,
  includeUpdatedAt: boolean,
): ({ publicReadEnabled: boolean; navigationVisible: boolean } & {
  updatedAt?: number;
}) | null => {
  const object = objectOf(value);
  const keys = includeUpdatedAt
    ? ["publicReadEnabled", "navigationVisible", "updatedAt"]
    : ["publicReadEnabled", "navigationVisible"];
  if (
    !object ||
    !hasOnly(object, keys) ||
    typeof object.publicReadEnabled !== "boolean" ||
    typeof object.navigationVisible !== "boolean"
  ) {
    return null;
  }
  if (
    includeUpdatedAt &&
    (!Number.isSafeInteger(object.updatedAt) || Number(object.updatedAt) < 0)
  ) {
    return null;
  }
  return {
    publicReadEnabled: object.publicReadEnabled,
    navigationVisible: object.navigationVisible,
    ...(includeUpdatedAt ? { updatedAt: Number(object.updatedAt) } : {}),
  };
};

export const parseReleaseRequest = (value: unknown): ReleaseInputResult => {
  const object = objectOf(value);
  if (!object || !hasOnly(object, ["expected", "target", "confirmation"])) {
    return { ok: false, fields: { body: "invalid_shape" } };
  }
  const expected = parseFlags(object.expected, true);
  const target = parseFlags(object.target, false);
  const confirmation = object.confirmation;
  const fields: Record<string, string> = {};
  if (!expected) fields.expected = "invalid";
  if (!target) fields.target = "invalid";
  if (
    typeof confirmation !== "string" ||
    !OTW_PLAY_ADMIN_RELEASE_CONFIRMATIONS.includes(
      confirmation as (typeof OTW_PLAY_ADMIN_RELEASE_CONFIRMATIONS)[number],
    )
  ) {
    fields.confirmation = "invalid";
  }
  if (Object.keys(fields).length > 0 || !expected || !target) {
    return { ok: false, fields };
  }
  return {
    ok: true,
    value: {
      expected: {
        publicReadEnabled: expected.publicReadEnabled,
        navigationVisible: expected.navigationVisible,
        updatedAt: expected.updatedAt!,
      },
      target: {
        publicReadEnabled: target.publicReadEnabled,
        navigationVisible: target.navigationVisible,
      },
      confirmation:
        confirmation as OtwPlayAdminReleaseRequest["confirmation"],
    },
  };
};
