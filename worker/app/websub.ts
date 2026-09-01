import {
  D1WebsubRepository,
  GoogleWebsubHubClient,
  WebsubService,
  YouTubeOtwPlayMetadataReader,
  type OtwPlayWebsubQueueMessage,
} from "../features/otw-play";
import type { Env } from "../platform/types";

export const createOtwPlayWebsubService = (env: Env) =>
  new WebsubService(
    new D1WebsubRepository(env.otw_db),
    new YouTubeOtwPlayMetadataReader(env.YOUTUBE_API_KEY, fetch, {
      db: env.otw_db,
      priority: "critical",
      origin: "otw_play_websub",
    }),
    new GoogleWebsubHubClient(),
    {
      send: async (message: OtwPlayWebsubQueueMessage) => {
        const queue = env.OTW_WEBSUB_QUEUE ?? env.OTW_PLAY_INGESTION_QUEUE;
        if (!queue) {
          throw new Error("OTW Play WebSub queue is not configured");
        }
        await queue.send(message);
      },
    },
    { 1: env.OTW_PLAY_WEBSUB_SECRET_V1 },
    env.OTW_PLAY_PUBLIC_ORIGIN,
  );
