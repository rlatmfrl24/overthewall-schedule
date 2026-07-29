import { asc, eq } from "drizzle-orm";
import { naverCafeSources } from "@db/schema";
import { getDb } from "../../../platform/db";
import { getSetting } from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";
import type {
  NaverCafeApplication,
  NaverCafeSourcePayload,
  NaverCafeSourceRecord,
  NaverCafeVisibility,
} from "../application/naver-cafe-application";
import { readStoredNaverCafePostsForSources } from "./naver-cafe-collector";

const ENABLED_SETTING_KEY = "naver_cafe_posts_enabled";
const VISIBILITY_SETTING_KEY = "naver_cafe_posts_visibility";

const normalizeVisibility = (
  value: string | null | undefined,
): NaverCafeVisibility =>
  value === "public" || value === "private" ? value : "members";

export class D1NaverCafeApplication implements NaverCafeApplication {
  private readonly db: ReturnType<typeof getDb>;
  private readonly env: Env;

  constructor(env: Env) {
    this.env = env;
    this.db = getDb(env);
  }

  async getConfig() {
    try {
      const enabled =
        (await getSetting(this.db, ENABLED_SETTING_KEY)) !== "false";
      const visibility = normalizeVisibility(
        await getSetting(this.db, VISIBILITY_SETTING_KEY),
      );
      return { enabled, visibility };
    } catch (error) {
      console.warn("Failed to read Naver Cafe posts config", error);
      return { enabled: true, visibility: "members" as const };
    }
  }

  async listSources(): Promise<NaverCafeSourceRecord[]> {
    return this.db
      .select()
      .from(naverCafeSources)
      .orderBy(asc(naverCafeSources.sort_order), asc(naverCafeSources.name));
  }

  async createSource(payload: NaverCafeSourcePayload) {
    const result = await this.db.insert(naverCafeSources).values(payload);
    return result.success;
  }

  async updateSource(id: number, payload: NaverCafeSourcePayload) {
    const result = await this.db
      .update(naverCafeSources)
      .set(payload)
      .where(eq(naverCafeSources.id, id));
    return result.success;
  }

  async deleteSource(id: number) {
    const result = await this.db
      .delete(naverCafeSources)
      .where(eq(naverCafeSources.id, id));
    return result.success;
  }

  readStoredPosts(sources: NaverCafeSourceRecord[], size: number) {
    return readStoredNaverCafePostsForSources(sources, {
      cacheDb: this.env.otw_db,
      size,
    });
  }
}

export const createD1NaverCafeApplication = (env: Env) =>
  new D1NaverCafeApplication(env);
