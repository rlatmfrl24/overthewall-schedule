import type {
  ChzzkClipDto,
  ChzzkClipsResponseDto,
  ChzzkLiveContentDto,
  ChzzkLiveStatusDebugDto,
  ChzzkVideoDto,
  ChzzkVideosResponseDto,
} from "@contracts/chzzk";
import { authorizeChzzkChannelTargets } from "./authorize-channel-targets";

const LIVE_STATUS_CONCURRENCY = 6;

export type ChzzkLiveStatusItem = {
  channelId: string;
  content: ChzzkLiveContentDto | null;
  debug?: ChzzkLiveStatusDebugDto;
};

export type ChzzkVideoFetchRequest = {
  channelId: string;
  page: number;
  size: number;
  cacheable?: boolean;
};

export type ChzzkClipFetchRequest = {
  channelId: string;
  size: number;
  cacheable?: boolean;
};

export type ChzzkVideoFetchResult = {
  channelId: string;
  content: ChzzkVideosResponseDto | null;
};

export type ChzzkClipFetchResult = {
  channelId: string;
  content: ChzzkClipsResponseDto | null;
};

export type ChzzkScheduleAutoFillResult = {
  updated: number;
  details?: unknown[];
};

export type ChzzkActor = {
  actorId?: string | null;
  actorName?: string | null;
  actorIp?: string | null;
};

export type ChzzkAutoFillAuditInput = ChzzkActor & {
  channelIds: string[];
  updated: number;
};

export interface ChzzkApplicationPorts {
  readAllowedChannelIds(): Promise<ReadonlySet<string>>;
  fetchLiveStatus(channelId: string): Promise<ChzzkLiveContentDto | null>;
  fetchLiveStatusWithDebug(channelId: string): Promise<{
    content: ChzzkLiveContentDto | null;
    debug: ChzzkLiveStatusDebugDto;
  }>;
  fetchVideosBatch(
    requests: ChzzkVideoFetchRequest[],
  ): Promise<ChzzkVideoFetchResult[]>;
  fetchClipsBatch(
    requests: ChzzkClipFetchRequest[],
  ): Promise<ChzzkClipFetchResult[]>;
  autoFillLiveSchedules(
    items: ChzzkLiveStatusItem[],
  ): Promise<ChzzkScheduleAutoFillResult>;
  writeAutoFillAudit(input: ChzzkAutoFillAuditInput): Promise<void>;
}

export class ChzzkAllowlistUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super("CHZZK channel allowlist is unavailable", options);
    this.name = "ChzzkAllowlistUnavailableError";
  }
}

export class ChzzkTargetsNotAllowedError extends Error {
  readonly unauthorized: string[];

  constructor(unauthorized: string[]) {
    super("Unapproved CHZZK channel targets");
    this.name = "ChzzkTargetsNotAllowedError";
    this.unauthorized = unauthorized;
  }
}

const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  mapper: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]!);
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => worker(),
    ),
  );
  return results;
};

export const isChzzkVideoCacheProfile = (page: number, size: number) =>
  (page === 0 && (size === 1 || size === 10)) ||
  (page >= 0 && page <= 2 && size === 5);

export const isChzzkClipCacheProfile = (size: number) => size === 10;

export const createChzzkApplication = (ports: ChzzkApplicationPorts) => {
  const assertAuthorized = async (channelIds: readonly string[]) => {
    let allowedChannelIds: ReadonlySet<string>;
    try {
      allowedChannelIds = await ports.readAllowedChannelIds();
    } catch (error) {
      throw new ChzzkAllowlistUnavailableError({ cause: error });
    }

    const authorized = authorizeChzzkChannelTargets(
      channelIds,
      allowedChannelIds,
    );
    if (!authorized.ok) {
      throw new ChzzkTargetsNotAllowedError(authorized.unauthorized);
    }
  };

  const fetchLiveStatuses = async (
    channelIds: string[],
    debug: boolean,
  ): Promise<ChzzkLiveStatusItem[]> => {
    await assertAuthorized(channelIds);
    return mapWithConcurrency(
      channelIds,
      async (channelId) => {
        if (debug) {
          const result = await ports.fetchLiveStatusWithDebug(channelId);
          return {
            channelId,
            content: result.content,
            debug: result.debug,
          };
        }
        return {
          channelId,
          content: await ports.fetchLiveStatus(channelId),
        };
      },
      LIVE_STATUS_CONCURRENCY,
    );
  };

  return {
    fetchLiveStatuses,

    async fetchVideos(channelIds: string[], page: number, size: number) {
      await assertAuthorized(channelIds);
      return ports.fetchVideosBatch(
        channelIds.map((channelId) => ({
          channelId,
          page,
          size,
          cacheable: isChzzkVideoCacheProfile(page, size),
        })),
      );
    },

    async fetchClips(channelIds: string[], size: number) {
      await assertAuthorized(channelIds);
      return ports.fetchClipsBatch(
        channelIds.map((channelId) => ({
          channelId,
          size,
          cacheable: isChzzkClipCacheProfile(size),
        })),
      );
    },

    async autoFillLiveSchedules(channelIds: string[], actor: ChzzkActor) {
      const items = await fetchLiveStatuses(channelIds, false);
      const result = await ports.autoFillLiveSchedules(items);
      try {
        await ports.writeAutoFillAudit({
          ...actor,
          channelIds,
          updated: result.updated,
        });
      } catch (error) {
        console.error("Failed to write live schedule auto-fill audit", error);
      }
      return result;
    },
  };
};

export type ChzzkApplication = ReturnType<typeof createChzzkApplication>;

export type ChzzkVideoCatalogItem = ChzzkVideoDto;
export type ChzzkClipCatalogItem = ChzzkClipDto;
