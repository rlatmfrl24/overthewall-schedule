import {
  ChannelMonitorService,
  D1ChannelMonitorRepository,
  YouTubeOtwPlayMetadataReader,
  readOtwPlayAutomationPaused,
} from "../features/otw-play";
import type { Env } from "../platform/types";
import { createOtwPlayWebsubService } from "./websub";

export const createOtwPlayChannelMonitorService = (env: Env) =>
  new ChannelMonitorService(
    new D1ChannelMonitorRepository(env.otw_db),
    new YouTubeOtwPlayMetadataReader(env.YOUTUBE_API_KEY, fetch, {
      db: env.otw_db,
      priority: "core",
      origin: "otw_play_reconcile",
    }),
    undefined,
    undefined,
    (monitorId, actorUserId) =>
      createOtwPlayWebsubService(env).unsubscribe(monitorId, actorUserId),
    () => readOtwPlayAutomationPaused(env.otw_db),
  );
