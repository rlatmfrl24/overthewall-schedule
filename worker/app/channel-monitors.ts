import {
  ChannelMonitorService,
  D1ChannelMonitorRepository,
  YouTubeOtwPlayMetadataReader,
  readOtwPlayAutomationPaused,
} from "../features/otw-play";
import type { Env } from "../platform/types";
import { parseSiteId } from "@contracts/site-definition";

export const createOtwPlayChannelMonitorService = (env: Env) =>
  new ChannelMonitorService(
    new D1ChannelMonitorRepository(env.otw_db,parseSiteId(env.SITE_ID)),
    new YouTubeOtwPlayMetadataReader(env.YOUTUBE_API_KEY, fetch, {
      db: env.otw_db,
      siteId:parseSiteId(env.SITE_ID),
      priority: "core",
      origin: "otw_play_reconcile",
    }),
    undefined,
    undefined,
    () => readOtwPlayAutomationPaused(env.otw_db),
  );
