import type { Env } from "../../../platform/types";
import {
  createChzzkApplication,
  type ChzzkApplicationPorts,
} from "../application/chzzk-service";
import {
  clearChzzkServiceCachesForTests,
  fetchChzzkClipsBatch,
  fetchChzzkLiveStatus,
  fetchChzzkLiveStatusWithDebug,
  fetchChzzkVideos,
  fetchChzzkVideosBatch,
  type ChzzkFetchOptions,
  type ChzzkVideoFetchRequest,
} from "./chzzk-api";
import {
  clearActiveChzzkChannelsCacheForTests,
  readActiveChzzkChannels,
} from "./d1-active-channels";

export type ChzzkExternalApplicationPorts = Pick<
  ChzzkApplicationPorts,
  "autoFillLiveSchedules" | "writeAutoFillAudit"
>;

export const buildChzzkApplication = (
  env: Env,
  externalPorts: ChzzkExternalApplicationPorts,
) => {
  return createChzzkApplication({
    readAllowedChannelIds: () => readActiveChzzkChannels(env.otw_db),
    fetchLiveStatus: (channelId) => fetchChzzkLiveStatus(channelId),
    fetchLiveStatusWithDebug: (channelId) =>
      fetchChzzkLiveStatusWithDebug(channelId),
    fetchVideosBatch: (requests) =>
      fetchChzzkVideosBatch(requests, env.otw_db),
    fetchClipsBatch: (requests) =>
      fetchChzzkClipsBatch(requests, env.otw_db),
    ...externalPorts,
  });
};

export const clearChzzkRouteCachesForTests = () => {
  clearActiveChzzkChannelsCacheForTests();
};

export type ChzzkVideoCatalog = {
  fetchVideos(
    channelId: string,
    page: number,
    size: number,
  ): ReturnType<typeof fetchChzzkVideos>;
  fetchVideosBatch(
    requests: ChzzkVideoFetchRequest[],
    cacheDb?: Pick<D1Database, "prepare">,
    options?: ChzzkFetchOptions,
  ): ReturnType<typeof fetchChzzkVideosBatch>;
};

export const chzzkVideoCatalog: ChzzkVideoCatalog = {
  fetchVideos: (channelId, page, size) =>
    fetchChzzkVideos(channelId, page, size),
  fetchVideosBatch: (requests, cacheDb, options) =>
    fetchChzzkVideosBatch(requests, cacheDb, options),
};

export { clearChzzkServiceCachesForTests };
