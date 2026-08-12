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
  type OtwPlayAdminCatalogSubjectInput,
  type OtwPlayAdminCatalogEntryPreflightRequest,
  type OtwPlayAdminCreateCatalogEntryRequest,
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

const parseCatalogSubject = (
  value: unknown,
): OtwPlayAdminCatalogSubjectInput | null => {
  if (!isObject(value)) return null;
  if (value.kind === "member") {
    const memberUid = integer(value.memberUid, 1);
    return memberUid === null ? null : { kind: "member", memberUid };
  }
  if (value.kind === "entity") {
    const entityId = nonEmptyString(value.entityId, 128);
    return entityId ? { kind: "entity", entityId } : null;
  }
  if (value.kind === "new_external") {
    const clientKey = nonEmptyString(value.clientKey, 128);
    const displayName = nonEmptyString(value.displayName, 300);
    const entityKind = inValues(value.entityKind, ["person", "group"] as const);
    return clientKey && displayName && entityKind
      ? { kind: "new_external", clientKey, displayName, entityKind }
      : null;
  }
  return null;
};

const parseCatalogSubjects = (value: unknown, allowEmpty = false) => {
  if (!Array.isArray(value) || value.length > 30 || (!allowEmpty && value.length === 0))
    return null;
  const parsed = value.map(parseCatalogSubject);
  return parsed.some((item) => item === null)
    ? null
    : parsed.filter((item): item is OtwPlayAdminCatalogSubjectInput => item !== null);
};

const catalogSubjectKey = (subject: OtwPlayAdminCatalogSubjectInput) => {
  switch (subject.kind) {
    case "member":
      return `member:${subject.memberUid}`;
    case "entity":
      return `entity:${subject.entityId}`;
    case "new_external":
      return `new_external:${subject.clientKey}`;
  }
};

const hasDuplicateCatalogSubjects = (
  subjects: OtwPlayAdminCatalogSubjectInput[],
) => {
  const keys = subjects.map(catalogSubjectKey);
  return new Set(keys).size !== keys.length;
};

export const parseCatalogEntryPreflight = (
  value: unknown,
): AdminInputResult<OtwPlayAdminCatalogEntryPreflightRequest> => {
  if (!isObject(value)) return fail({ body: "object_required" });
  const youtubeUrl = nonEmptyString(value.youtubeUrl, 500);
  const startSeconds = integer(value.startSeconds);
  return youtubeUrl && startSeconds !== null
    ? { ok: true, value: { youtubeUrl, startSeconds } }
    : fail({ body: "invalid_preflight" });
};

export const parseCreateCatalogEntry = (
  value: unknown,
): AdminInputResult<OtwPlayAdminCreateCatalogEntryRequest> => {
  if (!isObject(value) || !isObject(value.song) || !isObject(value.channel)) {
    return fail({ body: "invalid_catalog_entry" });
  }
  const expectedCatalogRevision = integer(value.expectedCatalogRevision);
  const youtubeUrl = nonEmptyString(value.youtubeUrl, 500);
  const startSeconds = integer(value.startSeconds);
  const endSeconds =
    value.endSeconds === null || value.endSeconds === undefined
      ? null
      : integer(value.endSeconds);
  const relationType = inValues(value.relationType, OTW_PLAY_RELATION_TYPES);
  const releaseType = inValues(value.releaseType, [
    "official_mv",
    "official_video",
  ] as const);
  const participationType = inValues(
    value.participationType,
    OTW_PLAY_PARTICIPATION_TYPES,
  );
  const publicationTarget = inValues(value.publicationTarget, [
    "draft",
    "published",
  ] as const);
  const internalNote = nullableString(value.internalNote, 2_000);

  let song: OtwPlayAdminCreateCatalogEntryRequest["song"] | null = null;
  if (value.song.kind === "existing") {
    const songId = nonEmptyString(value.song.songId, 128);
    if (songId) song = { kind: "existing", songId };
  } else if (value.song.kind === "from_video") {
    song = { kind: "from_video" };
  } else if (value.song.kind === "create") {
    const title = nonEmptyString(value.song.title, 300);
    const precision = inValues(
      value.song.originalReleasePrecision,
      OTW_PLAY_DATE_PRECISIONS,
    );
    const releaseDate = nullableString(value.song.originalReleaseDate, 10);
    const aliases = Array.isArray(value.song.aliases) && value.song.aliases.length <= 50
      ? value.song.aliases.map((raw) => {
          if (!isObject(raw)) return null;
          const alias = nonEmptyString(raw.alias, 300);
          return alias
            ? {
                alias,
                locale: nullableString(raw.locale, 30),
                aliasKind: nullableString(raw.aliasKind, 60),
              }
            : null;
        })
      : null;
    const artists = Array.isArray(value.song.originalArtists)
      ? value.song.originalArtists.map((raw) => {
          if (!isObject(raw)) return null;
          const subject = parseCatalogSubject(raw.subject);
          const creditOrder = integer(raw.creditOrder);
          return subject && creditOrder !== null && typeof raw.isPrimary === "boolean"
            ? { subject, creditOrder, isPrimary: raw.isPrimary }
            : null;
        })
      : null;
    const validDate =
      precision === "unknown"
        ? value.song.originalReleaseDate === null
        : releaseDate !== null;
    if (
      title &&
      typeof value.song.isOtwOriginal === "boolean" &&
      precision &&
      validDate &&
      aliases &&
      !aliases.some((item) => item === null) &&
      artists &&
      artists.length > 0 &&
      artists.length <= 30 &&
      !artists.some((item) => item === null) &&
      artists.filter((item) => item?.isPrimary).length === 1
    ) {
      song = {
        kind: "create",
        title,
        isOtwOriginal: value.song.isOtwOriginal,
        originalReleaseDate: releaseDate,
        originalReleasePrecision: precision,
        aliases: aliases.filter((item): item is NonNullable<typeof item> => item !== null),
        originalArtists: artists.filter((item): item is NonNullable<typeof item> => item !== null),
      };
    }
  }

  const participants = Array.isArray(value.participants)
    ? value.participants.map((raw) => {
        if (!isObject(raw)) return null;
        const subject = parseCatalogSubject(raw.subject);
        const participantRole = inValues(
          raw.participantRole,
          OTW_PLAY_PARTICIPANT_ROLES,
        );
        const creditOrder = integer(raw.creditOrder);
        const creditNameSnapshot = nullableString(raw.creditNameSnapshot, 300);
        return subject && participantRole && creditOrder !== null
          ? {
              subject,
              participantRole,
              creditOrder,
              ...(creditNameSnapshot ? { creditNameSnapshot } : {}),
            }
          : null;
      })
    : null;

  let channel: OtwPlayAdminCreateCatalogEntryRequest["channel"] | null = null;
  if (value.channel.kind === "existing") {
    const channelId = nonEmptyString(value.channel.channelId, 128);
    if (channelId) channel = { kind: "existing", channelId };
  } else if (value.channel.kind === "recognized_member") {
    const memberUid = integer(value.channel.memberUid, 1);
    const channelRole = inValues(value.channel.channelRole, [
      "member_music",
      "member_main",
    ] as const);
    if (memberUid !== null && channelRole)
      channel = { kind: "recognized_member", memberUid, channelRole };
  } else if (value.channel.kind === "confirm" || value.channel.kind === "pending") {
    const channelRole = inValues(value.channel.channelRole, OTW_PLAY_CHANNEL_ROLES);
    const owners = parseCatalogSubjects(value.channel.owners);
    if (channelRole && owners)
      channel = { kind: value.channel.kind, channelRole, owners };
  }

  const orders = participants?.map((item) => item?.creditOrder) ?? [];
  const parsedParticipants = participants?.filter(
    (item): item is NonNullable<typeof item> => item !== null,
  );
  const parsedArtists = song?.kind === "create" ? song.originalArtists : null;
  const artistOrders = parsedArtists?.map((item) => item.creditOrder) ?? [];
  const channelOwners =
    channel?.kind === "confirm" || channel?.kind === "pending"
      ? channel.owners
      : null;
  const hasSingingCredit = participants?.some(
    (item) =>
      item?.participantRole === "vocal" ||
      item?.participantRole === "featured_vocal" ||
      item?.participantRole === "chorus",
  );
  if (
    expectedCatalogRevision === null ||
    !youtubeUrl ||
    startSeconds === null ||
    (value.endSeconds !== null && value.endSeconds !== undefined && endSeconds === null) ||
    (endSeconds !== null && endSeconds <= startSeconds) ||
    !song ||
    !participants ||
    participants.length === 0 ||
    participants.length > 30 ||
    participants.some((item) => item === null) ||
    new Set(orders).size !== orders.length ||
    (parsedParticipants !== undefined &&
      hasDuplicateCatalogSubjects(parsedParticipants.map((item) => item.subject))) ||
    (parsedArtists !== null &&
      (new Set(artistOrders).size !== artistOrders.length ||
        hasDuplicateCatalogSubjects(parsedArtists.map((item) => item.subject)))) ||
    (channelOwners !== null && hasDuplicateCatalogSubjects(channelOwners)) ||
    !channel ||
    !relationType ||
    !releaseType ||
    !participationType ||
    !publicationTarget ||
    (value.internalNote !== undefined && value.internalNote !== null && internalNote === null) ||
    (publicationTarget === "published" && !hasSingingCredit)
  ) {
    return fail({ body: "invalid_catalog_entry" });
  }

  return {
    ok: true,
    value: {
      expectedCatalogRevision,
      youtubeUrl,
      startSeconds,
      endSeconds,
      song,
      participants: participants.filter(
        (item): item is NonNullable<typeof item> => item !== null,
      ),
      channel,
      relationType,
      releaseType,
      participationType,
      publicationTarget,
      internalNote,
    },
  };
};
