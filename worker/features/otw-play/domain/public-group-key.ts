import {
  decodeUtf8Base64Url,
  encodeUtf8Base64Url,
} from "./utf8-base64url";

const GROUP_KEY_PREFIX = "g1_";
const MAX_ENTITY_ID_LENGTH = 128;
const MAX_UNIT_NAME_LENGTH = 100;

export type PublicCatalogGroupSelector = Readonly<{
  entityId: string | null;
  unitName: string | null;
}>;

export type PublicCatalogGroupKeyErrorReason =
  | "malformed"
  | "unsupported_version"
  | "invalid_selector";

export class PublicCatalogGroupKeyError extends Error {
  readonly reason: PublicCatalogGroupKeyErrorReason;

  constructor(reason: PublicCatalogGroupKeyErrorReason) {
    super(`Invalid public catalog group key: ${reason}`);
    this.name = "PublicCatalogGroupKeyError";
    this.reason = reason;
  }
}

const normalizeOptionalValue = (value: string | null, maxLength: number) => {
  if (value === null) return null;
  if (value !== value.trim() || value.length === 0 || value.length > maxLength) {
    throw new PublicCatalogGroupKeyError("invalid_selector");
  }
  return value;
};

const normalizeSelector = (
  selector: PublicCatalogGroupSelector,
): PublicCatalogGroupSelector => {
  const entityId = normalizeOptionalValue(
    selector.entityId,
    MAX_ENTITY_ID_LENGTH,
  );
  const unitName = normalizeOptionalValue(
    selector.unitName,
    MAX_UNIT_NAME_LENGTH,
  );
  if ((entityId === null) === (unitName === null)) {
    throw new PublicCatalogGroupKeyError("invalid_selector");
  }
  return { entityId, unitName };
};

export const encodePublicCatalogGroupKey = (
  selector: PublicCatalogGroupSelector,
) => {
  const normalized = normalizeSelector(selector);
  const kind = normalized.entityId === null ? "unit" : "entity";
  const identifier = normalized.entityId ?? normalized.unitName;
  return `${GROUP_KEY_PREFIX}${encodeUtf8Base64Url(
    JSON.stringify({
      v: 1,
      k: kind,
      i: identifier,
    }),
  )}`;
};

export const decodePublicCatalogGroupKey = (
  key: string,
): PublicCatalogGroupSelector => {
  const versionMatch = key.match(/^g(\d+)_/);
  if (!versionMatch) {
    throw new PublicCatalogGroupKeyError("malformed");
  }
  if (versionMatch[1] !== "1") {
    throw new PublicCatalogGroupKeyError("unsupported_version");
  }

  try {
    const value = JSON.parse(
      decodeUtf8Base64Url(key.slice(GROUP_KEY_PREFIX.length)),
    ) as unknown;
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      Object.keys(value).sort().join(",") !== "i,k,v"
    ) {
      throw new PublicCatalogGroupKeyError("malformed");
    }

    const record = value as Record<string, unknown>;
    if (
      record.v !== 1 ||
      (record.k !== "entity" && record.k !== "unit") ||
      typeof record.i !== "string"
    ) {
      throw new PublicCatalogGroupKeyError("malformed");
    }

    const selector = normalizeSelector({
      entityId: record.k === "entity" ? record.i : null,
      unitName: record.k === "unit" ? record.i : null,
    });
    if (encodePublicCatalogGroupKey(selector) !== key) {
      throw new PublicCatalogGroupKeyError("malformed");
    }
    return selector;
  } catch (error) {
    if (error instanceof PublicCatalogGroupKeyError) throw error;
    throw new PublicCatalogGroupKeyError("malformed");
  }
};
