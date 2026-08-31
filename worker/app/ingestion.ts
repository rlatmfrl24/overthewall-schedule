import {
  D1IngestionRepository,
  IngestionService,
  YouTubeOtwPlayMetadataReader,
  type OtwPlayIngestionQueueMessage,
} from "../features/otw-play";
import type { Env } from "../platform/types";
import { createOtwPlayAdminCatalogService } from "./admin-catalog";

export const createOtwPlayIngestionService = (env: Env) =>
  new IngestionService(
    new D1IngestionRepository(env.otw_db),
    new YouTubeOtwPlayMetadataReader(env.YOUTUBE_API_KEY, fetch, {
      db: env.otw_db,
      priority: "critical",
    }),
    {
      send: async (message: OtwPlayIngestionQueueMessage) => {
        if (!env.OTW_PLAY_INGESTION_QUEUE) {
          throw new Error("OTW Play ingestion queue is not configured");
        }
        await env.OTW_PLAY_INGESTION_QUEUE.send(message);
      },
    },
    () => crypto.randomUUID(),
    Date.now,
    createOtwPlayAdminCatalogService(env),
  );
