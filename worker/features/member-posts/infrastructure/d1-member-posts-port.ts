import { publicationHiddenSql } from "../../content-access";
import { naverCafeSourceMemberSql } from "../../naver-cafe";
import { parseSiteId } from "@contracts/site-definition";
import type { XPostFeedService } from "../../x-posts";
import { asc, sql } from "drizzle-orm";
import type { MemberPostsPageRequest } from "@contracts/member-posts";
import { members, naverCafeSources } from "@db/schema";
import { getDb } from "../../../platform/db";
import { getSetting } from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";
import type {
  MemberPostsPort,
  NaverCafePostsContent,
  NaverCafeSourceRecord,
  Visibility,
} from "../application/ports";
import { GetMemberPosts } from "../application/get-member-posts";


export type NaverCafeReader = (
  sources: NaverCafeSourceRecord[],
  options: { cacheDb: D1Database; size: number; page?: MemberPostsPageRequest; siteId?: import("@contracts/site-definition").SiteId },
) => Promise<NaverCafePostsContent>;

const normalizeVisibility = (
  value: string | null | undefined,
): Visibility =>
  value === "public" || value === "private" ? value : "members";

export class D1MemberPostsPort implements MemberPostsPort {
  private readonly db: ReturnType<typeof getDb>;
  private readonly env: Env;
  private readonly xFeed: XPostFeedService;
  private readonly readNaverCafe: NaverCafeReader;

  constructor(
    env: Env,
    xFeed: XPostFeedService,
    readNaverCafe: NaverCafeReader,
  ) {
    this.env = env;
    this.xFeed = xFeed;
    this.readNaverCafe = readNaverCafe;
    this.db = getDb(env);
  }

  async readConfigs() {
    const [
      xVisibility,
      richXLinkPreview,
      naverCafeEnabled,
      naverCafeVisibility,
    ] = await Promise.all([
      getSetting(this.db, "x_posts_visibility"),
      getSetting(this.db, "x_rich_link_preview_enabled"),
      getSetting(this.db, "naver_cafe_posts_enabled"),
      getSetting(this.db, "naver_cafe_posts_visibility"),
    ]);
    return {
      x: {
        visibility: normalizeVisibility(xVisibility),
        richLinkPreviewEnabled: richXLinkPreview === "true",
      },
      naverCafe: {
        enabled: naverCafeEnabled !== "false",
        visibility: normalizeVisibility(naverCafeVisibility),
      },
    };
  }

  listActiveMembers() {
    return this.db
      .select()
      .from(members)
      .where(
        sql`${members.content_access} = 'normal' AND NOT (${sql.raw(publicationHiddenSql("members","members",parseSiteId(this.env.SITE_ID)))}) AND (${members.is_deprecated} IS NULL OR ${members.is_deprecated} = 0)`,
      )
      .orderBy(asc(members.uid));
  }

  listNaverCafeSources() {
    return this.db
      .select()
      .from(naverCafeSources)
      .where(sql`${naverCafeSources.archived_at} IS NULL AND ${sql.raw(naverCafeSourceMemberSql("naver_cafe_sources", parseSiteId(this.env.SITE_ID)))}`)
      .orderBy(asc(naverCafeSources.sort_order), asc(naverCafeSources.name));
  }

  extractXHandle(url: string | null | undefined) {
    return this.xFeed.extractHandle(url);
  }

  fetchXPosts(
    handles: string[],
    options: {
      maxResults: number;
      richXLinkPreviewEnabled: boolean;
      page?: MemberPostsPageRequest;
    },
  ) {
    return this.xFeed.fetchPosts(handles, {
      siteId: parseSiteId(this.env.SITE_ID),
      cacheDb: this.env.otw_db,
      maxResults: options.maxResults,
      richXLinkPreviewEnabled: options.richXLinkPreviewEnabled,
      ...(options.page ? { storedPage: options.page } : {}),
    });
  }

  isXApiError(error: unknown) {
    return this.xFeed.isApiError(error);
  }

  async readFeedUpdatedAt(xPostIds: string[], cafePostIds: string[]) {
    // Bound reads to the authorized posts actually returned by the source readers.
    const queries = [];
    for (const [table, ids] of [["x_posts", xPostIds], ["naver_cafe_posts", cafePostIds]] as const) {
      const unique = [...new Set(ids)];
      for (let offset = 0; offset < unique.length; offset += 80) {
        const chunk = unique.slice(offset, offset + 80);
        queries.push(this.env.otw_db.prepare(
          `SELECT MAX(fetched_at) AS updated_at FROM ${table} WHERE id IN (${chunk.map(() => "?").join(",")})`,
        ).bind(...chunk).first<{ updated_at: number | null }>());
      }
    }
    const rows = await Promise.all(queries);
    const timestamps = rows.map(row => Number(row?.updated_at)).filter(value => value > 0 && Number.isFinite(value) && !Number.isNaN(new Date(value).getTime()));
    return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
  }

  readNaverCafePosts(sources: NaverCafeSourceRecord[], size: number, page?: MemberPostsPageRequest) {
    return this.readNaverCafe(sources, {
      cacheDb: this.env.otw_db,
      siteId: parseSiteId(this.env.SITE_ID),
      size,
      ...(page ? { page } : {}),
    });
  }
}

export const createD1MemberPostsApplication = (
  env: Env,
  xFeed: XPostFeedService,
  readNaverCafe: NaverCafeReader,
) => new GetMemberPosts(new D1MemberPostsPort(env, xFeed, readNaverCafe));
