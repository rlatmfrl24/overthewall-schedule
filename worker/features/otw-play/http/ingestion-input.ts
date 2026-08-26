import {
  OTW_PLAY_INGESTION_CANDIDATE_STATUSES,
  type OtwPlayIngestionCandidateStatus,
  type OtwPlayConvertIngestionCandidateRequest,
  type OtwPlayConvertIngestionCandidatesRequest,
  type OtwPlayCreatePlaylistImportRequest,
  type OtwPlayIgnoreIngestionCandidatesRequest,
  type OtwPlayIngestionReviewInput,
  type OtwPlayPlaylistPreflightRequest,
  type OtwPlayPublicChannelRole,
  type OtwPlayUpdateIngestionCandidateRequest,
} from "@contracts/otw-play";
import { OTW_PLAY_INGESTION_OFFICIAL_CHANNEL_ROLES } from "../domain/ingestion-channel-policy";
import { parseCreateCatalogEntry } from "./admin-catalog-input";

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
  const rangeStart = value.rangeStart;
  const rangeLimit = value.rangeLimit;
  const hasRange = rangeStart !== undefined || rangeLimit !== undefined;
  if (
    !playlistUrl ||
    !mode ||
    (mode === "recent" &&
      (!Number.isSafeInteger(recentLimit) ||
        Number(recentLimit) < 1 ||
        Number(recentLimit) > 5_000)) ||
    (mode === "all_new" && recentLimit !== undefined) ||
    (mode === "recent" && hasRange) ||
    (hasRange && (
      rangeStart === undefined ||
      rangeLimit === undefined ||
      !Number.isSafeInteger(rangeStart) ||
      Number(rangeStart) < 0 ||
      !Number.isSafeInteger(rangeLimit) ||
      Number(rangeLimit) < 1 ||
      Number(rangeLimit) > 5_000 ||
      !Number.isSafeInteger(Number(rangeStart) + Number(rangeLimit))
    ))
  ) {
    return { ok: false, fields: { body: "invalid_playlist_import" } };
  }
  return {
    ok: true,
    value: {
      playlistUrl,
      mode,
      ...(mode === "recent" ? { recentLimit: Number(recentLimit) } : {}),
      ...(hasRange
        ? {
            rangeStart: Number(rangeStart),
            rangeLimit: Number(rangeLimit),
          }
        : {}),
    },
  };
};

export const parsePlaylistPreflight = (
  value: unknown,
): IngestionInputResult<OtwPlayPlaylistPreflightRequest> =>
  parseBase(value, [
    "playlistUrl",
    "mode",
    "recentLimit",
    "rangeStart",
    "rangeLimit",
  ]);

export const parseCreatePlaylistImport = (
  value: unknown,
): IngestionInputResult<OtwPlayCreatePlaylistImportRequest> => {
  const parsed = parseBase(value, [
    "playlistUrl",
    "mode",
    "recentLimit",
    "rangeStart",
    "rangeLimit",
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

const parseCandidateReviewInput = (
  value: unknown,
): IngestionInputResult<OtwPlayIngestionReviewInput> => {
  if (
    !isObject(value) ||
    !hasExactKeys(value, [
      "song",
      "participants",
      "relationType",
      "releaseType",
      "participationType",
      "startSeconds",
      "endSeconds",
      "internalNote",
    ])
  ) {
    return { ok: false, fields: { input: "invalid_shape" } };
  }
  const parsed = parseCreateCatalogEntry({
    expectedCatalogRevision: 0,
    youtubeUrl: "https://www.youtube.com/watch?v=AAAAAAAAAAA",
    startSeconds: value.startSeconds ?? 0,
    endSeconds: value.endSeconds ?? null,
    ...value,
    channel: { kind: "existing", channelId: "candidate-channel" },
    publicationTarget: "draft",
  });
  if (!parsed.ok) {
    return { ok: false, fields: { input: "invalid_review_input" } };
  }
  const {
    song,
    participants,
    relationType,
    releaseType,
    participationType,
    startSeconds,
    endSeconds,
    internalNote,
  } = parsed.value;
  return {
    ok: true,
    value: {
      song,
      participants,
      relationType,
      releaseType,
      participationType,
      ...(value.startSeconds !== undefined ? { startSeconds } : {}),
      ...(value.endSeconds !== undefined ? { endSeconds } : {}),
      internalNote,
    },
  };
};

export const parseConvertIngestionCandidate = (
  value: unknown,
): IngestionInputResult<OtwPlayConvertIngestionCandidateRequest> => {
  if (!isObject(value) || !hasExactKeys(value, ["expectedVersion"])) {
    return { ok: false, fields: { body: "invalid_shape" } };
  }
  return Number.isSafeInteger(value.expectedVersion) && Number(value.expectedVersion) >= 0
    ? { ok: true, value: { expectedVersion: Number(value.expectedVersion) } }
    : { ok: false, fields: { expectedVersion: "invalid" } };
};

export const parseUpdateIngestionCandidate = (
  value: unknown,
): IngestionInputResult<OtwPlayUpdateIngestionCandidateRequest> => {
  if (!isObject(value)) {
    return { ok: false, fields: { body: "invalid_shape" } };
  }
  const expectedVersion = value.expectedVersion;
  if (!Number.isSafeInteger(expectedVersion) || Number(expectedVersion) < 0) {
    return { ok: false, fields: { expectedVersion: "invalid" } };
  }
  if (value.action === "save") {
    if (!hasExactKeys(value, [
      "expectedVersion",
      "expectedReviewInput",
      "expectedReviewStatus",
      "action",
      "input",
    ])) {
      return { ok: false, fields: { body: "invalid_shape" } };
    }
    const input = parseCandidateReviewInput(value.input);
    if (!input.ok) return input;
    const expectedReviewInput = value.expectedReviewInput === undefined ||
        value.expectedReviewInput === null
      ? value.expectedReviewInput
      : parseCandidateReviewInput(value.expectedReviewInput);
    if (
      expectedReviewInput !== undefined &&
      expectedReviewInput !== null &&
      !expectedReviewInput.ok
    ) {
      return { ok: false, fields: { expectedReviewInput: "invalid_review_input" } };
    }
    const expectedReviewStatus = typeof value.expectedReviewStatus === "string" &&
        OTW_PLAY_INGESTION_CANDIDATE_STATUSES.includes(
          value.expectedReviewStatus as OtwPlayIngestionCandidateStatus,
        )
      ? value.expectedReviewStatus as OtwPlayIngestionCandidateStatus
      : value.expectedReviewStatus === undefined
        ? undefined
        : null;
    if (expectedReviewStatus === null) {
      return { ok: false, fields: { expectedReviewStatus: "invalid" } };
    }
    return {
      ok: true,
      value: {
        expectedVersion: Number(expectedVersion),
        ...(expectedReviewInput !== undefined
          ? {
              expectedReviewInput: expectedReviewInput === null
                ? null
                : expectedReviewInput.value,
            }
          : {}),
        ...(expectedReviewStatus !== undefined ? { expectedReviewStatus } : {}),
        action: "save",
        input: input.value,
      },
    };
  }
  if (value.action === "approve_channel") {
    if (
      !hasExactKeys(value, ["expectedVersion", "action", "channel"]) ||
      !isObject(value.channel)
    ) {
      return { ok: false, fields: { body: "invalid_shape" } };
    }
    const ownershipKind = value.channel.ownershipKind;
    const externalApproval = ownershipKind === "external";
    if (!hasExactKeys(
      value.channel,
      externalApproval
        ? [
            "ownershipKind",
            "channelRole",
            "entityIds",
            "externalApprovalConfirmed",
          ]
        : ["ownershipKind", "channelRole", "entityIds"],
    )) {
      return { ok: false, fields: { channel: "invalid" } };
    }
    const channelRole = typeof value.channel.channelRole === "string" &&
        OTW_PLAY_INGESTION_OFFICIAL_CHANNEL_ROLES.includes(
          value.channel.channelRole as OtwPlayPublicChannelRole,
        )
      ? value.channel.channelRole as OtwPlayPublicChannelRole
      : null;
    const entityIds = Array.isArray(value.channel.entityIds) &&
        value.channel.entityIds.length <= 30
      ? value.channel.entityIds.map((item) => text(item, 128))
      : null;
    if (
      !channelRole ||
      !entityIds ||
      entityIds.some((item) => item === null) ||
      new Set(entityIds).size !== entityIds.length ||
      (
        ownershipKind === "otw_official"
          ? channelRole !== "otw_official" || entityIds.length !== 0
          : ownershipKind === "member"
            ? !["member_music", "member_main"].includes(channelRole) ||
              entityIds.length === 0
            : ownershipKind === "external"
              ? channelRole !== "project_official" ||
                entityIds.length === 0 ||
                value.channel.externalApprovalConfirmed !== true
              : true
      )
    ) {
      return { ok: false, fields: { channel: "invalid" } };
    }
    if (ownershipKind === "otw_official") {
      return {
        ok: true,
        value: {
          expectedVersion: Number(expectedVersion),
          action: "approve_channel",
          channel: {
            ownershipKind,
            channelRole: "otw_official",
            entityIds: [],
          },
        },
      };
    }
    if (ownershipKind === "member") {
      return {
        ok: true,
        value: {
          expectedVersion: Number(expectedVersion),
          action: "approve_channel",
          channel: {
            ownershipKind,
            channelRole: channelRole as "member_music" | "member_main",
            entityIds: entityIds as string[],
          },
        },
      };
    }
    return {
      ok: true,
      value: {
        expectedVersion: Number(expectedVersion),
        action: "approve_channel",
        channel: {
          ownershipKind: "external",
          channelRole: "project_official",
          entityIds: entityIds as string[],
          externalApprovalConfirmed: true,
        },
      },
    };
  }
  if (value.action === "ignore" || value.action === "refresh_metadata") {
    return hasExactKeys(value, ["expectedVersion", "action"])
      ? {
          ok: true,
          value: {
            expectedVersion: Number(expectedVersion),
            action: value.action,
          },
        }
      : { ok: false, fields: { body: "invalid_shape" } };
  }
  return { ok: false, fields: { action: "invalid" } };
};

const parseIngestionCandidateSelections = (
  value: unknown,
): IngestionInputResult<{ candidates: Array<{ id: string; expectedVersion: number }> }> => {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ["candidates"]) ||
    !Array.isArray(value.candidates) ||
    value.candidates.length < 1 ||
    value.candidates.length > 100
  ) {
    return { ok: false, fields: { candidates: "invalid" } };
  }
  const candidates = value.candidates.map((item) => {
    if (!isObject(item) || !hasExactKeys(item, ["id", "expectedVersion"])) {
      return null;
    }
    const id = text(item.id, 128);
    return id && Number.isSafeInteger(item.expectedVersion) &&
        Number(item.expectedVersion) >= 0
      ? { id, expectedVersion: Number(item.expectedVersion) }
      : null;
  });
  if (
    candidates.some((item) => item === null) ||
    new Set(candidates.map((item) => item?.id)).size !== candidates.length
  ) {
    return { ok: false, fields: { candidates: "invalid" } };
  }
  return {
    ok: true,
    value: {
      candidates: candidates.filter(
        (item): item is NonNullable<typeof item> => item !== null,
      ),
    },
  };
};

export const parseConvertIngestionCandidates = (
  value: unknown,
): IngestionInputResult<OtwPlayConvertIngestionCandidatesRequest> =>
  parseIngestionCandidateSelections(value);

export const parseIgnoreIngestionCandidates = (
  value: unknown,
): IngestionInputResult<OtwPlayIgnoreIngestionCandidatesRequest> =>
  parseIngestionCandidateSelections(value);

export const parseRetryIngestionJob = (
  value: unknown,
): IngestionInputResult<Record<string, never>> =>
  isObject(value) && Object.keys(value).length === 0
    ? { ok: true, value: {} }
    : { ok: false, fields: { body: "empty_object_required" } };
