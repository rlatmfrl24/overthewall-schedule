import type {
  OtwPlayCreatePlaylistImportRequest,
  OtwPlayPlaylistPreflightRequest,
} from "@contracts/otw-play";

export type IngestionInputResult<T> =
  | { ok: true; value: T }
  | { ok: false; fields: Record<string, string> };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[],
) => Object.keys(value).every((key) => allowed.includes(key));

const text = (value: unknown, max: number) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && [...normalized].length <= max ? normalized : null;
};

const parseBase = (
  value: unknown,
  allowedKeys: readonly string[],
): IngestionInputResult<OtwPlayPlaylistPreflightRequest> => {
  if (!isObject(value) || !hasExactKeys(value, allowedKeys)) {
    return { ok: false, fields: { body: "invalid_shape" } };
  }
  const playlistUrl = text(value.playlistUrl, 500);
  const mode = value.mode === "all_new" || value.mode === "recent"
    ? value.mode
    : null;
  const recentLimit = value.recentLimit;
  if (
    !playlistUrl ||
    !mode ||
    (mode === "recent" &&
      (!Number.isSafeInteger(recentLimit) ||
        Number(recentLimit) < 1 ||
        Number(recentLimit) > 5_000)) ||
    (mode === "all_new" && recentLimit !== undefined)
  ) {
    return { ok: false, fields: { body: "invalid_playlist_import" } };
  }
  return {
    ok: true,
    value: {
      playlistUrl,
      mode,
      ...(mode === "recent" ? { recentLimit: Number(recentLimit) } : {}),
    },
  };
};

export const parsePlaylistPreflight = (
  value: unknown,
): IngestionInputResult<OtwPlayPlaylistPreflightRequest> =>
  parseBase(value, ["playlistUrl", "mode", "recentLimit"]);

export const parseCreatePlaylistImport = (
  value: unknown,
): IngestionInputResult<OtwPlayCreatePlaylistImportRequest> => {
  const parsed = parseBase(value, [
    "playlistUrl",
    "mode",
    "recentLimit",
    "idempotencyKey",
  ]);
  if (!parsed.ok) return parsed;
  if (!isObject(value)) {
    return { ok: false, fields: { body: "invalid_shape" } };
  }
  const idempotencyKey = text(value.idempotencyKey, 128);
  if (!idempotencyKey || !/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)) {
    return { ok: false, fields: { idempotencyKey: "invalid" } };
  }
  return { ok: true, value: { ...parsed.value, idempotencyKey } };
};
