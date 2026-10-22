import { createMultiviewService, D1MultiviewChannelRepository, type MultiviewService } from "../features/multiview";
import { ChzzkMultiviewReader } from "../features/chzzk";
import type { Env } from "../platform/types";

export const createMultiviewServiceForEnv = (env: Env): MultiviewService => createMultiviewService(new D1MultiviewChannelRepository(env.otw_db), new ChzzkMultiviewReader());
