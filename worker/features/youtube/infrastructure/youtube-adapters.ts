import { getDb } from "../../../platform/db";
import type { Env } from "../../../platform/types";
import { createYouTubeApplication } from "../application/youtube-service";
import { createD1KirinukiRepository } from "./d1-kirinuki-repository";
import { readActiveYouTubeChannels } from "./d1-active-channels";
import { readYouTubeVods } from "./d1-youtube-vods";
import { readYouTubeFeedStatus } from "./d1-youtube-feed-status";
import { readOfficialYouTubeShorts, readStoredYouTubeFeed } from "./youtube-feed";

export const buildYouTubeApplication = (env: Env) => {
  const repository = createD1KirinukiRepository(getDb(env));
  return createYouTubeApplication({
    readVods: (input) => readYouTubeVods(env, input),
    readFeedStatus: (hours) => readYouTubeFeedStatus(env, hours),
    readAllowedChannelIds: () => readActiveYouTubeChannels(env.otw_db),
    readStoredFeed: (ids, limit, source) => readStoredYouTubeFeed(env, ids, limit, source),
    readShorts: (ids, limit, cursor, ctx) => readOfficialYouTubeShorts(env, ids, limit, cursor, ctx),
    listKirinukiChannels: () => repository.list(),
    createKirinukiChannel: (input) => repository.create(input),
    updateKirinukiChannel: (input) => repository.update(input),
    deleteKirinukiChannel: (id) => repository.delete(id),
  });
};
