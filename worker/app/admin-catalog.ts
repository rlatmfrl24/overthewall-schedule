import {
  AdminCatalogService,
  D1AdminCatalogRepository,
  DrizzleAdminCatalogAudit,
  YouTubeOtwPlayMetadataReader,
} from "../features/otw-play";
import { getDb } from "../platform/db";
import type { Env } from "../platform/types";

export const createOtwPlayAdminCatalogService = (env: Env) =>
  new AdminCatalogService(
    new D1AdminCatalogRepository(env.otw_db),
    new YouTubeOtwPlayMetadataReader(env.YOUTUBE_API_KEY, fetch, {
      db: env.otw_db,
      priority: "core",
    }),
    new DrizzleAdminCatalogAudit(getDb(env)),
    () => crypto.randomUUID(),
    true,
  );
