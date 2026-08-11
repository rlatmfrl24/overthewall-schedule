import {
  OTW_PLAY_CHANNEL_ROLES,
  OTW_PLAY_CHANNEL_VERIFICATION_STATUSES,
  OTW_PLAY_DATE_PRECISIONS,
  OTW_PLAY_ENTITY_KINDS,
  OTW_PLAY_PARTICIPANT_ROLES,
  OTW_PLAY_PARTICIPATION_TYPES,
  OTW_PLAY_QUALITY_STATUSES,
  OTW_PLAY_RELATION_TYPES,
  type OtwPlayAdminCreateChannelRequest,
  type OtwPlayAdminApproveProposalRequest,
  type OtwPlayAdminCreateEntityRequest,
  type OtwPlayAdminCreatePerformanceRequest,
  type OtwPlayAdminCreateSongRequest,
  type OtwPlayAdminExpectedVersionRequest,
  type OtwPlayAdminRecheckSourceRequest,
  type OtwPlayAdminRejectProposalRequest,
  type OtwPlayAdminUpdateChannelRequest,
  type OtwPlayAdminUpdateEntityRequest,
  type OtwPlayAdminUpdatePerformanceRequest,
  type OtwPlayAdminUpdateSongRequest,
} from "@contracts/otw-play";

type JsonObject = Record<string, unknown>;
export type AdminInputResult<T> =
  | { ok: true; value: T }
  | { ok: false; fields: Record<string, string> };

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown, max = 300) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.trim().length <= max
    ? value.trim()
    : null;

const nullableString = (value: unknown, max = 2_000) =>
  value === null || value === undefined ? null : nonEmptyString(value, max);

const integer = (value: unknown, minimum = 0) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum
    ? value
    : null;

const inValues = <T extends string>(
  value: unknown,
  values: readonly T[],
): T | null =>
  typeof value === "string" && values.includes(value as T)
    ? (value as T)
    : null;

const fail = <T>(fields: Record<string, string>): AdminInputResult<T> => ({
  ok: false,
  fields,
});

const parseExpectedVersion = (value: unknown) => {
  if (!isObject(value))
    return fail<OtwPlayAdminExpectedVersionRequest>({
      body: "object_required",
    });
  const expectedVersion = integer(value.expectedVersion);
  return expectedVersion === null
    ? fail<OtwPlayAdminExpectedVersionRequest>({ expectedVersion: "invalid" })
    : { ok: true as const, value: { expectedVersion } };
};

const parseEntityReferences = (
  value: unknown,
  kind: "artist" | "participant",
) => {
  if (!Array.isArray(value) || value.length === 0 || value.length > 30)
    return null;
  const seenEntities = new Set<string>();
  const seenOrders = new Set<number>();
  const result: OtwPlayAdminCreateSongRequest["originalArtists"] = [];
  for (const raw of value) {
    if (!isObject(raw)) return null;
    const entityId = nonEmptyString(raw.entityId, 128);
    const creditOrder = integer(raw.creditOrder);
    const participantRole =
      kind === "participant"
        ? inValues(raw.participantRole, OTW_PLAY_PARTICIPANT_ROLES)
        : undefined;
    const creditNameSnapshot =
      kind === "participant"
        ? nonEmptyString(raw.creditNameSnapshot, 300)
        : undefined;
    if (
      !entityId ||
      creditOrder === null ||
      seenEntities.has(entityId) ||
      seenOrders.has(creditOrder) ||
      (kind === "participant" && (!participantRole || !creditNameSnapshot))
    )
      return null;
    seenEntities.add(entityId);
    seenOrders.add(creditOrder);
    result.push({
      entityId,
      creditOrder,
      isPrimary: kind === "artist" ? raw.isPrimary === true : undefined,
      participantRole: participantRole ?? undefined,
      creditNameSnapshot: creditNameSnapshot ?? undefined,
    });
  }
  return result.sort((left, right) => left.creditOrder - right.creditOrder);
};

const parseSongCore = (value: JsonObject) => {
  const slug = nonEmptyString(value.slug, 128);
  const title = nonEmptyString(value.title, 300);
  const originalReleasePrecision = inValues(
    value.originalReleasePrecision,
    OTW_PLAY_DATE_PRECISIONS,
  );
  const originalReleaseDate = nullableString(value.originalReleaseDate, 10);
  const artists = parseEntityReferences(value.originalArtists, "artist");
  const aliases =
    Array.isArray(value.aliases) && value.aliases.length <= 50
      ? value.aliases.map((raw) => {
          if (!isObject(raw)) return null;
          const alias = nonEmptyString(raw.alias, 300);
          if (!alias) return null;
          return {
            alias,
            locale: nullableString(raw.locale, 30),
            aliasKind: nullableString(raw.aliasKind, 60),
          };
        })
      : null;
  const dateIsValid =
    originalReleasePrecision === "unknown"
      ? value.originalReleaseDate === null
      : typeof originalReleaseDate === "string";
  if (
    !slug ||
    !title ||
    typeof value.isOtwOriginal !== "boolean" ||
    !originalReleasePrecision ||
    !dateIsValid ||
    !artists ||
    artists.filter((artist) => artist.isPrimary).length !== 1 ||
    !aliases ||
    aliases.some((alias) => alias === null)
  )
    return null;
  return {
    slug,
    title,
    isOtwOriginal: value.isOtwOriginal,
    originalReleaseDate,
    originalReleasePrecision,
    aliases: aliases.filter(
      (alias): alias is NonNullable<typeof alias> => alias !== null,
    ),
    originalArtists: artists,
  } satisfies OtwPlayAdminCreateSongRequest;
};

export const parseCreateSong = (
  value: unknown,
): AdminInputResult<OtwPlayAdminCreateSongRequest> => {
  if (!isObject(value)) return fail({ body: "object_required" });
  const parsed = parseSongCore(value);
  return parsed ? { ok: true, value: parsed } : fail({ body: "invalid_song" });
};

export const parseUpdateSong = (
  value: unknown,
): AdminInputResult<OtwPlayAdminUpdateSongRequest> => {
  if (!isObject(value)) return fail({ body: "object_required" });
  const parsed = parseSongCore(value);
  const id = nonEmptyString(value.id, 128);
  const expectedVersion = integer(value.expectedVersion);
  return parsed && id && expectedVersion !== null
    ? { ok: true, value: { ...parsed, id, expectedVersion } }
    : fail({ body: "invalid_song" });
};

const parsePerformanceCore = (value: JsonObject) => {
  const songId = nonEmptyString(value.songId, 128);
  const relationType = inValues(value.relationType, OTW_PLAY_RELATION_TYPES);
  const releaseType = inValues(value.releaseType, [
    "official_mv",
    "official_video",
  ] as const);
  const participationType = inValues(
    value.participationType,
    OTW_PLAY_PARTICIPATION_TYPES,
  );
  const qualityStatus = inValues(
    value.qualityStatus,
    OTW_PLAY_QUALITY_STATUSES,
  );
  const releasedAt =
    value.releasedAt === null ? null : integer(value.releasedAt);
  const participants = parseEntityReferences(value.participants, "participant");
  const source = isObject(value.source) ? value.source : null;
  const youtubeUrl = source ? nonEmptyString(source.youtubeUrl, 500) : null;
  const channelId = source ? nonEmptyString(source.channelId, 128) : null;
  const startSeconds = source ? integer(source.startSeconds) : null;
  const endSeconds =
    source?.endSeconds === null || source?.endSeconds === undefined
      ? null
      : integer(source.endSeconds);
  const sourceRole = source
    ? inValues(source.sourceRole, ["official", "alternate"] as const)
    : null;
  if (
    !songId ||
    !relationType ||
    !releaseType ||
    !participationType ||
    !qualityStatus ||
    (value.releasedAt !== null && releasedAt === null) ||
    !participants ||
    !source ||
    !youtubeUrl ||
    !channelId ||
    startSeconds === null ||
    !sourceRole ||
    (source.endSeconds !== null &&
      source.endSeconds !== undefined &&
      endSeconds === null) ||
    (endSeconds !== null && endSeconds <= startSeconds)
  )
    return null;
  return {
    songId,
    relationType,
    releaseType,
    participationType,
    qualityStatus,
    releasedAt,
    internalNote: nullableString(value.internalNote, 2_000),
    participants,
    source: { youtubeUrl, channelId, startSeconds, endSeconds, sourceRole },
  } satisfies OtwPlayAdminCreatePerformanceRequest;
};

export const parseCreatePerformance = (
  value: unknown,
): AdminInputResult<OtwPlayAdminCreatePerformanceRequest> => {
  if (!isObject(value)) return fail({ body: "object_required" });
  const parsed = parsePerformanceCore(value);
  return parsed
    ? { ok: true, value: parsed }
    : fail({ body: "invalid_performance" });
};

export const parseUpdatePerformance = (
  value: unknown,
): AdminInputResult<OtwPlayAdminUpdatePerformanceRequest> => {
  if (!isObject(value)) return fail({ body: "object_required" });
  const parsed = parsePerformanceCore(value);
  const id = nonEmptyString(value.id, 128);
  const expectedVersion = integer(value.expectedVersion);
  return parsed && id && expectedVersion !== null
    ? { ok: true, value: { ...parsed, id, expectedVersion } }
    : fail({ body: "invalid_performance" });
};

const parseChannelCore = (value: JsonObject) => {
  const externalChannelId = nonEmptyString(value.externalChannelId, 24);
  const displayName = nonEmptyString(value.displayName, 300);
  const channelRole = inValues(value.channelRole, OTW_PLAY_CHANNEL_ROLES);
  const entityIds =
    Array.isArray(value.entityIds) && value.entityIds.length <= 30
      ? value.entityIds.map((item) => nonEmptyString(item, 128))
      : null;
  if (
    !externalChannelId ||
    !/^UC[A-Za-z0-9_-]{22}$/.test(externalChannelId) ||
    !displayName ||
    !channelRole ||
    !entityIds ||
    entityIds.some((item) => !item) ||
    new Set(entityIds).size !== entityIds.length
  )
    return null;
  return {
    externalChannelId,
    displayName,
    channelRole,
    entityIds: entityIds as string[],
  };
};

export const parseCreateChannel = (
  value: unknown,
): AdminInputResult<OtwPlayAdminCreateChannelRequest> => {
  if (!isObject(value)) return fail({ body: "object_required" });
  const parsed = parseChannelCore(value);
  return parsed
    ? { ok: true, value: parsed }
    : fail({ body: "invalid_channel" });
};

export const parseUpdateChannel = (
  value: unknown,
): AdminInputResult<OtwPlayAdminUpdateChannelRequest> => {
  if (!isObject(value)) return fail({ body: "object_required" });
  const parsed = parseChannelCore(value);
  const id = nonEmptyString(value.id, 128);
  const expectedVersion = integer(value.expectedVersion);
  const verificationStatus = inValues(
    value.verificationStatus,
    OTW_PLAY_CHANNEL_VERIFICATION_STATUSES,
  );
  if (
    !parsed ||
    !id ||
    expectedVersion === null ||
    !verificationStatus ||
    typeof value.active !== "boolean" ||
    (value.active && verificationStatus !== "approved")
  )
    return fail({ body: "invalid_channel" });
  return {
    ok: true,
    value: {
      ...parsed,
      id,
      expectedVersion,
      verificationStatus,
      active: value.active,
    },
  };
};

const parseEntityCore = (value: JsonObject) => {
  const entityKind = inValues(value.entityKind, OTW_PLAY_ENTITY_KINDS);
  const displayName = nonEmptyString(value.displayName, 300);
  const slug = nonEmptyString(value.slug, 128);
  const memberUid =
    value.memberUid === null || value.memberUid === undefined
      ? null
      : integer(value.memberUid, 1);
  if (
    !entityKind ||
    !displayName ||
    !slug ||
    (value.memberUid !== null &&
      value.memberUid !== undefined &&
      memberUid === null) ||
    (memberUid !== null && entityKind !== "person")
  )
    return null;
  return { memberUid, entityKind, displayName, slug };
};

export const parseCreateEntity = (
  value: unknown,
): AdminInputResult<OtwPlayAdminCreateEntityRequest> => {
  if (!isObject(value)) return fail({ body: "object_required" });
  const parsed = parseEntityCore(value);
  return parsed
    ? { ok: true, value: parsed }
    : fail({ body: "invalid_entity" });
};

export const parseUpdateEntity = (
  value: unknown,
): AdminInputResult<OtwPlayAdminUpdateEntityRequest> => {
  if (!isObject(value)) return fail({ body: "object_required" });
  const parsed = parseEntityCore(value);
  const id = nonEmptyString(value.id, 128);
  const expectedVersion = integer(value.expectedVersion);
  return parsed &&
    id &&
    expectedVersion !== null &&
    typeof value.archived === "boolean"
    ? {
        ok: true,
        value: { ...parsed, id, expectedVersion, archived: value.archived },
      }
    : fail({ body: "invalid_entity" });
};

export const parseVersionRequest = parseExpectedVersion;

export const parseRejectProposal = (
  value: unknown,
): AdminInputResult<OtwPlayAdminRejectProposalRequest> => {
  const version = parseExpectedVersion(value);
  if (!version.ok || !isObject(value))
    return fail({ body: "invalid_rejection" });
  const resultCode = nonEmptyString(value.resultCode, 100);
  const note = nullableString(value.note, 2_000);
  return resultCode &&
    (value.note === undefined || value.note === null || note !== null)
    ? { ok: true, value: { ...version.value, resultCode, note } }
    : fail({ body: "invalid_rejection" });
};

export const parseApproveProposal = (
  value: unknown,
): AdminInputResult<OtwPlayAdminApproveProposalRequest> => {
  const version = parseExpectedVersion(value);
  if (
    !version.ok ||
    !isObject(value) ||
    !isObject(value.song) ||
    !isObject(value.performance)
  ) {
    return fail({ body: "invalid_approval" });
  }
  const existingSongId = nonEmptyString(value.song.existingSongId, 128);
  const createSong = isObject(value.song.create)
    ? parseSongCore(value.song.create)
    : null;
  if ((!existingSongId && !createSong) || (existingSongId && createSong)) {
    return fail({ song: "choose_existing_or_create" });
  }
  const rawSource = isObject(value.performance.source)
    ? value.performance.source
    : null;
  if (!rawSource) return fail({ performance: "invalid" });
  const parsedPerformance = parsePerformanceCore({
    ...value.performance,
    songId: existingSongId ?? "new-song",
    source: { ...rawSource, youtubeUrl: "https://youtu.be/dQw4w9WgXcQ" },
  });
  if (!parsedPerformance || typeof value.publish !== "boolean") {
    return fail({ performance: "invalid" });
  }
  return {
    ok: true,
    value: {
      expectedVersion: version.value.expectedVersion,
      song: existingSongId ? { existingSongId } : { create: createSong! },
      performance: {
        relationType: parsedPerformance.relationType,
        releaseType: parsedPerformance.releaseType,
        participationType: parsedPerformance.participationType,
        qualityStatus: parsedPerformance.qualityStatus,
        releasedAt: parsedPerformance.releasedAt,
        internalNote: parsedPerformance.internalNote,
        participants: parsedPerformance.participants,
        source: {
          channelId: parsedPerformance.source.channelId,
          startSeconds: parsedPerformance.source.startSeconds,
          endSeconds: parsedPerformance.source.endSeconds,
          sourceRole: parsedPerformance.source.sourceRole,
        },
      },
      publish: value.publish,
    },
  };
};

export const parseRecheckSource = (
  value: unknown,
): AdminInputResult<OtwPlayAdminRecheckSourceRequest> => {
  const version = parseExpectedVersion(value);
  if (!version.ok || !isObject(value)) return fail({ body: "invalid_recheck" });
  const youtubeUrl = nonEmptyString(value.youtubeUrl, 500);
  const channelId = nonEmptyString(value.channelId, 128);
  return youtubeUrl && channelId
    ? { ok: true, value: { ...version.value, youtubeUrl, channelId } }
    : fail({ body: "invalid_recheck" });
};
