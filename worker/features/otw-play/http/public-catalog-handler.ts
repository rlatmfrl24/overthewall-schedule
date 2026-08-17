import type {
  OtwPlayPublicCatalogDto,
  OtwPlayPublicConfigDto,
  OtwPlayPublicCreditDto,
  OtwPlayPublicEnvelope,
  OtwPlayPublicErrorCode,
  OtwPlayPublicFacetsDto,
  OtwPlayPublicParticipantDto,
  OtwPlayPublicPerformanceDetailDto,
  OtwPlayPublicPerformanceResponseDto,
  OtwPlayPublicPerformanceSummaryDto,
  OtwPlayPublicSongDetailDto,
  OtwPlayPublicSongSummaryDto,
  OtwPlayPublicSourceDto,
} from "@contracts/otw-play";
import type { Env } from "../../../platform/types";
import {
  PublicCatalogService,
  PublicCatalogServiceError,
  type PublicCatalogDetailResult,
  type PublicCatalogReadContext,
  type PublicCatalogReadResult,
} from "../application/public-catalog-service";
import type {
  PublicCatalogEntity,
  PublicCatalogFacets,
  PublicCatalogParticipant,
  PublicCatalogPerformance,
  PublicCatalogPerformanceDetail,
  PublicCatalogSongDetail,
  PublicCatalogSongSummary,
  PublicCatalogSource,
} from "../application/ports/public-catalog-reader";
import { PublicCatalogCursorError } from "../domain/public-catalog-cursor";
import { encodePublicCatalogGroupKey } from "../domain/public-group-key";
import {
  canonicalizePublicCatalogQuery,
  isValidPublicCatalogSlug,
  parsePublicCatalogQuery,
  PublicCatalogQueryError,
} from "../domain/public-catalog-query";

const ALLOWED_PUBLIC_CHANNEL_ROLES = new Set([
  "otw_official",
  "unit_official",
  "member_music",
  "member_main",
  "project_official",
]);

const CACHE_CONTROL = {
  config: "public, max-age=60, s-maxage=1800",
  catalog: "public, max-age=60, s-maxage=300",
  catalogSearch: "private, max-age=30",
  catalogCursor: "private, max-age=60",
  facets: "public, max-age=60, s-maxage=1800",
  detail: "public, max-age=60, s-maxage=600",
  private: "no-store",
} as const;

type PublicCatalogEtagFactory = (material: string) => Promise<string>;
type PublicCatalogServiceResolver = (env: Env) => PublicCatalogService;

class PublicCatalogProjectionError extends Error {
  constructor() {
    super("Invalid public catalog projection");
    this.name = "PublicCatalogProjectionError";
  }
}

const toIso = (value: number | null) =>
  value === null ? null : new Date(value).toISOString();

const toPublicSlug = (value: string) => {
  if (!isValidPublicCatalogSlug(value)) {
    throw new PublicCatalogProjectionError();
  }
  return value;
};

const toCredit = (entity: PublicCatalogEntity): OtwPlayPublicCreditDto => ({
  entityId: entity.id,
  slug: toPublicSlug(entity.slug),
  displayName: entity.displayName,
  kind: entity.entityKind,
});

const toParticipant = (
  participant: PublicCatalogParticipant,
): OtwPlayPublicParticipantDto => {
  const base = {
    entityId: participant.id,
    slug: toPublicSlug(participant.slug),
    displayName: participant.creditName,
    role: participant.participantRole,
    creditOrder: participant.creditOrder,
  };
  if (participant.kind === "current_member") {
    if (!participant.member) throw new PublicCatalogProjectionError();
    return {
      ...base,
      kind: "current_member",
      uid: participant.member.uid,
      code: participant.member.code,
      oshiMark: participant.member.oshiMark,
      unitName: participant.member.unitName,
    };
  }
  if (participant.kind === "group") {
    return {
      ...base,
      kind: "group",
      groupKey: encodePublicCatalogGroupKey({
        entityId: participant.id,
        unitName: null,
      }),
    };
  }
  return { ...base, kind: "external" };
};

const toSource = (
  source: PublicCatalogSource,
): OtwPlayPublicSourceDto | null => {
  if (
    (source.sourceRole !== "official" && source.sourceRole !== "alternate") ||
    !ALLOWED_PUBLIC_CHANNEL_ROLES.has(source.channel.channelRole)
  ) {
    return null;
  }
  return {
    sourceId: source.id,
    provider: source.provider,
    externalId: source.externalId,
    title: source.title,
    thumbnailUrl: source.thumbnailUrl,
    durationSeconds: source.durationSeconds,
    providerPublishedAt: toIso(source.providerPublishedAt),
    availability: source.availabilityStatus,
    sourceRole: source.sourceRole,
    startSeconds: source.startSeconds,
    endSeconds: source.endSeconds,
    priority: source.priority,
    isPrimary: source.isPrimary,
    playable: source.availabilityStatus === "playable",
    channel: {
      id: source.channel.id,
      displayName: source.channel.displayName,
      role: source.channel.channelRole,
    },
  };
};

const toPerformanceBase = (
  performance: PublicCatalogPerformance,
): OtwPlayPublicPerformanceSummaryDto => {
  if (
    performance.releaseType !== "official_mv" &&
    performance.releaseType !== "official_video"
  ) {
    throw new PublicCatalogProjectionError();
  }
  const sources = performance.sources
    .map(toSource)
    .filter((source): source is OtwPlayPublicSourceDto => source !== null);
  const selectedSource =
    sources.find(({ sourceId }) => sourceId === performance.playbackSourceId) ??
    null;
  const playable = selectedSource?.playable === true;
  return {
    id: performance.id,
    relation: performance.relation,
    releaseType: performance.releaseType,
    participation: performance.participation,
    releasedAt: toIso(performance.releasedAt),
    participants: performance.participants.map(toParticipant),
    selectedSource,
    sourceCount: sources.length,
    playable,
    usingFallback:
      playable && performance.primarySourceId !== selectedSource.sourceId,
  };
};

const toPerformanceDetail = (
  performance: PublicCatalogPerformance,
): OtwPlayPublicPerformanceDetailDto => {
  const summary = toPerformanceBase(performance);
  return {
    ...summary,
    sources: performance.sources
      .map(toSource)
      .filter((source): source is OtwPlayPublicSourceDto => source !== null),
  };
};

const toSongSummary = (
  song: PublicCatalogSongSummary,
): OtwPlayPublicSongSummaryDto => {
  const representativePerformance = toPerformanceBase(
    song.representativePerformance,
  );
  return {
    id: song.id,
    slug: toPublicSlug(song.slug),
    title: song.title,
    isOtwOriginal: song.isOtwOriginal,
    originalReleaseDate: song.originalReleaseDate,
    originalReleasePrecision: song.originalReleasePrecision,
    originalArtists: song.originalArtists.map(toCredit),
    representativePerformance,
    performanceCount: song.publishedPerformanceCount,
    playable: representativePerformance.playable,
  };
};

const toSongDetail = (
  song: PublicCatalogSongDetail,
): OtwPlayPublicSongDetailDto => {
  const performances = song.performances.map(toPerformanceDetail);
  return {
    id: song.id,
    slug: toPublicSlug(song.slug),
    title: song.title,
    isOtwOriginal: song.isOtwOriginal,
    originalReleaseDate: song.originalReleaseDate,
    originalReleasePrecision: song.originalReleasePrecision,
    originalArtists: song.originalArtists.map(toCredit),
    performanceCount: performances.length,
    playable: performances.some(({ playable }) => playable),
    performances,
  };
};

const toPerformanceResponse = (
  detail: PublicCatalogPerformanceDetail,
): OtwPlayPublicPerformanceResponseDto => ({
  song: {
    id: detail.song.id,
    slug: toPublicSlug(detail.song.slug),
    title: detail.song.title,
    isOtwOriginal: detail.song.isOtwOriginal,
  },
  performance: toPerformanceDetail(detail.performance),
});

const toFacets = (facets: PublicCatalogFacets): OtwPlayPublicFacetsDto => ({
  members: facets.members.map((member) => ({
    memberUid: member.memberUid,
    code: member.code,
    displayName: member.name,
    oshiMark: member.oshiMark,
    unitName: member.unitName,
  })),
  groups: facets.groups.map((group) => ({
    key: group.key,
    kind: group.kind,
    displayName: group.displayName,
  })),
  originalArtists: facets.originalArtists.map((artist) => ({
    slug: toPublicSlug(artist.slug),
    displayName: artist.displayName,
  })),
});

const mapDocument = <Input, Output>(
  document: OtwPlayPublicEnvelope<Input>,
  map: (data: Input) => Output,
): OtwPlayPublicEnvelope<Output> => ({
  ...document,
  data: map(document.data),
});

const requestIdFor = (request: Request) =>
  request.headers.get("cf-ray")?.trim() || crypto.randomUUID();

const errorResponse = (
  code: OtwPlayPublicErrorCode,
  message: string,
  status: number,
  requestId: string,
  fields?: Record<string, string>,
  request?: Request,
) => {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Request-ID": requestId,
  });
  if (request && hasPrivateHeaders(request)) {
    headers.set("Vary", "Authorization, Cookie");
  }
  return new Response(
    JSON.stringify({
      error: {
        code,
        message,
        ...(fields ? { fields } : {}),
        requestId,
      },
    }),
    {
      status,
      headers,
    },
  );
};

const decodePathSegment = (value: string) => {
  try {
    const decoded = decodeURIComponent(value);
    return isValidPublicCatalogSlug(decoded) ? decoded : null;
  } catch {
    return null;
  }
};

const hasPrivateHeaders = (request: Request) =>
  request.headers.has("Authorization") || request.headers.has("Cookie");

const matchesEtag = (header: string | null, etag: string) =>
  header
    ?.split(",")
    .map((value) => value.trim())
    .some(
      (value) =>
        value === "*" ||
        value.replace(/^W\//, "") === etag.replace(/^W\//, ""),
    ) ?? false;

const successResponse = async <Data>(
  request: Request,
  document: OtwPlayPublicEnvelope<Data>,
  cacheControl: string,
  etagMaterial: string,
  createEtag: PublicCatalogEtagFactory,
  requestId: string,
) => {
  const privateRequest = hasPrivateHeaders(request);
  const etag = await createEtag(etagMaterial);
  const headers = new Headers({
    "Cache-Control": privateRequest ? CACHE_CONTROL.private : cacheControl,
    "Content-Type": "application/json; charset=utf-8",
    ETag: etag,
    "X-Request-ID": requestId,
  });
  if (privateRequest) {
    headers.set("Vary", "Authorization, Cookie");
  }
  if (matchesEtag(request.headers.get("If-None-Match"), etag)) {
    headers.delete("Content-Type");
    return new Response(null, { status: 304, headers });
  }
  return new Response(JSON.stringify(document), { status: 200, headers });
};

const disabledResponse = (requestId: string, request: Request) =>
  errorResponse(
    "PLAY_PUBLIC_READ_DISABLED",
    "OTW Play 공개 카탈로그를 사용할 수 없습니다.",
    404,
    requestId,
    undefined,
    request,
  );

const notFoundResponse = (requestId: string, request: Request) =>
  errorResponse(
    "PLAY_NOT_FOUND",
    "요청한 OTW Play 항목을 찾을 수 없습니다.",
    404,
    requestId,
    undefined,
    request,
  );

const readContext = (request: Request): PublicCatalogReadContext => ({
  allowSharedCache: !hasPrivateHeaders(request),
});

const endpointName = (pathname: string) => {
  if (pathname === "/api/play/config") return "config";
  if (pathname === "/api/play/catalog") return "catalog";
  if (pathname === "/api/play/facets") return "facets";
  if (pathname.startsWith("/api/play/songs/")) return "song";
  if (pathname.startsWith("/api/play/performances/")) return "performance";
  return "unknown";
};

const logFailure = (
  endpoint: string,
  requestId: string,
  error: unknown,
) => {
  console.error("[otw-play] public catalog request failed", {
    endpoint,
    requestId,
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
};

const handleReadResult = <Input, Output>(
  result: PublicCatalogReadResult<Input>,
  map: (input: Input) => Output,
) =>
  result.status === "ok"
    ? ({ ...result, document: mapDocument(result.document, map) } as const)
    : result;

const handleDetailResult = <Input, Output>(
  result: PublicCatalogDetailResult<Input>,
  map: (input: Input) => Output,
) =>
  result.status === "ok"
    ? ({ ...result, document: mapDocument(result.document, map) } as const)
    : result;

export const createPublicCatalogHandler = (
  resolveService: PublicCatalogServiceResolver,
  createEtag: PublicCatalogEtagFactory,
) => async (request: Request, env: Env): Promise<Response> => {
  const requestId = requestIdFor(request);
  const url = new URL(request.url);
  const endpoint = endpointName(url.pathname);

  if (request.method !== "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET", "Cache-Control": "no-store" },
    });
  }

  try {
    const service = resolveService(env);
    const context = readContext(request);
    const meta = await service.readPublicState();

    if (url.pathname === "/api/play/config") {
      if (url.searchParams.size > 0) {
        throw new PublicCatalogQueryError("unknown_parameter", "query");
      }
      const result = await service.readConfig(context, meta);
      const data: OtwPlayPublicConfigDto = {
        publicReadEnabled: result.document.data.publicReadEnabled,
        navigationVisible: result.document.data.navigationVisible,
      };
      const document: OtwPlayPublicEnvelope<OtwPlayPublicConfigDto> = {
        ...result.document,
        data,
      };
      const etagMaterial = [
        "play-config-v1",
        result.document.catalogRevision,
        Number(result.document.data.publicReadEnabled),
        Number(result.document.data.navigationVisible),
        result.document.data.updatedAt,
      ].join("|");
      return successResponse(
        request,
        document,
        CACHE_CONTROL.config,
        etagMaterial,
        createEtag,
        requestId,
      );
    }

    if (!meta.publicReadEnabled) return disabledResponse(requestId, request);

    if (url.pathname === "/api/play/catalog") {
      const query = parsePublicCatalogQuery(url.searchParams.entries());
      const result = handleReadResult(
        await service.browseCatalog(query, context, meta),
        (data): OtwPlayPublicCatalogDto => ({
          items: data.items.map(toSongSummary),
        }),
      );
      if (result.status === "disabled") {
        return disabledResponse(requestId, request);
      }
      const cacheControl = query.normalizedQuery
        ? CACHE_CONTROL.catalogSearch
        : query.cursorToken
          ? CACHE_CONTROL.catalogCursor
          : CACHE_CONTROL.catalog;
      const identity = canonicalizePublicCatalogQuery(query, {
        includeCursor: true,
      });
      return successResponse(
        request,
        result.document,
        cacheControl,
        `play-catalog-v1|${result.document.catalogRevision}|${identity}`,
        createEtag,
        requestId,
      );
    }

    if (url.pathname === "/api/play/facets") {
      if (url.searchParams.size > 0) {
        throw new PublicCatalogQueryError("unknown_parameter", "query");
      }
      const result = handleReadResult(
        await service.readFacets(context, meta),
        toFacets,
      );
      if (result.status === "disabled") {
        return disabledResponse(requestId, request);
      }
      return successResponse(
        request,
        result.document,
        CACHE_CONTROL.facets,
        `play-facets-v1|${result.document.catalogRevision}`,
        createEtag,
        requestId,
      );
    }

    const songMatch = url.pathname.match(/^\/api\/play\/songs\/([^/]+)$/);
    if (songMatch) {
      if (url.searchParams.size > 0) {
        throw new PublicCatalogQueryError("unknown_parameter", "query");
      }
      const slug = decodePathSegment(songMatch[1] ?? "");
      if (!slug) return notFoundResponse(requestId, request);
      const result = handleDetailResult(
        await service.readSong(slug, context, meta),
        toSongDetail,
      );
      if (result.status === "disabled") {
        return disabledResponse(requestId, request);
      }
      if (result.status === "not_found") {
        return notFoundResponse(requestId, request);
      }
      return successResponse(
        request,
        result.document,
        CACHE_CONTROL.detail,
        `play-song-v1|${result.document.catalogRevision}|${slug}`,
        createEtag,
        requestId,
      );
    }

    const performanceMatch = url.pathname.match(
      /^\/api\/play\/performances\/([^/]+)$/,
    );
    if (performanceMatch) {
      if (url.searchParams.size > 0) {
        throw new PublicCatalogQueryError("unknown_parameter", "query");
      }
      const performanceId = decodePathSegment(performanceMatch[1] ?? "");
      if (!performanceId) return notFoundResponse(requestId, request);
      const result = handleDetailResult(
        await service.readPerformance(performanceId, context, meta),
        toPerformanceResponse,
      );
      if (result.status === "disabled") {
        return disabledResponse(requestId, request);
      }
      if (result.status === "not_found") {
        return notFoundResponse(requestId, request);
      }
      return successResponse(
        request,
        result.document,
        CACHE_CONTROL.detail,
        `play-performance-v1|${result.document.catalogRevision}|${performanceId}`,
        createEtag,
        requestId,
      );
    }

    return notFoundResponse(requestId, request);
  } catch (error) {
    if (error instanceof PublicCatalogQueryError) {
      return errorResponse(
        "PLAY_INVALID_QUERY",
        "OTW Play 조회 조건이 올바르지 않습니다.",
        400,
        requestId,
        { [error.field]: error.reason },
        request,
      );
    }
    if (error instanceof PublicCatalogCursorError) {
      const stale = error.reason === "revision_mismatch";
      return errorResponse(
        stale ? "PLAY_CURSOR_STALE" : "PLAY_INVALID_CURSOR",
        stale
          ? "카탈로그가 변경되었습니다. 첫 페이지부터 다시 조회해 주세요."
          : "OTW Play cursor가 올바르지 않습니다.",
        stale ? 409 : 400,
        requestId,
        undefined,
        request,
      );
    }
    if (
      error instanceof PublicCatalogProjectionError ||
      (error instanceof PublicCatalogServiceError &&
        error.reason === "reader_cursor_contract")
    ) {
      logFailure(endpoint, requestId, error);
      return errorResponse(
        "PLAY_INTERNAL_ERROR",
        "OTW Play 응답을 구성하지 못했습니다.",
        500,
        requestId,
        undefined,
        request,
      );
    }
    logFailure(endpoint, requestId, error);
    return errorResponse(
      "PLAY_CATALOG_UNAVAILABLE",
      "OTW Play 카탈로그를 일시적으로 불러올 수 없습니다.",
      503,
      requestId,
      undefined,
      request,
    );
  }
};
