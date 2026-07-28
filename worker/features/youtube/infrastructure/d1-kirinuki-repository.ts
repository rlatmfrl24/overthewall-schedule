import type {
  CreateKirinukiChannelDto,
  KirinukiChannelDto,
  UpdateKirinukiChannelDto,
} from "@contracts/youtube";
import { kirinukiChannels } from "@db/schema";
import { eq } from "drizzle-orm";
import type { DbInstance } from "../../../platform/db";

export const createD1KirinukiRepository = (db: DbInstance) => ({
  list: async (): Promise<KirinukiChannelDto[]> =>
    db
      .select()
      .from(kirinukiChannels)
      .orderBy(kirinukiChannels.channel_name),

  async create(input: CreateKirinukiChannelDto) {
    const result = await db.insert(kirinukiChannels).values(input);
    return result.success;
  },

  async update(input: UpdateKirinukiChannelDto) {
    const result = await db
      .update(kirinukiChannels)
      .set({
        channel_name: input.channel_name,
        channel_url: input.channel_url,
        youtube_channel_id: input.youtube_channel_id,
      })
      .where(eq(kirinukiChannels.id, input.id));
    return result.success;
  },

  async delete(id: number) {
    const result = await db
      .delete(kirinukiChannels)
      .where(eq(kirinukiChannels.id, id));
    return result.success;
  },
});
