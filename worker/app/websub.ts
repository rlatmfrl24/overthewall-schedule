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
    new YouTubeOtwPlayMetadataReader(env.YOUTUBE_API_KEY),
    new GoogleWebsubHubClient(),
    {
      send: async (message: OtwPlayWebsubQueueMessage) => {
        if (!env.OTW_PLAY_INGESTION_QUEUE) {
          throw new Error("OTW Play ingestion queue is not configured");
        }
        await env.OTW_PLAY_INGESTION_QUEUE.send(message);
      },
    },
    { 1: env.OTW_PLAY_WEBSUB_SECRET_V1 },
    env.OTW_PLAY_PUBLIC_ORIGIN,
  );
