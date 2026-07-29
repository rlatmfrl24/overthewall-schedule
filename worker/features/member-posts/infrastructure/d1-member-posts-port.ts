import { asc, sql } from "drizzle-orm";
import { members, naverCafeSources } from "@db/schema";
import { getDb } from "../../../platform/db";
import { getSetting } from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";
import type {
  MemberPostsPort,
  NaverCafePostsContent,
  NaverCafeSourceRecord,
  Visibility,
  XPostsContent,
} from "../application/ports";
import { GetMemberPosts } from "../application/get-member-posts";

export type XFeedService = {
  extractHandle(url: string | null | undefined): string | null;
  fetchPosts(
    handles: string[],
    options: {
      bearerToken?: string;
      cacheDb: D1Database;
      maxResults: number;
      richXLinkPreviewEnabled: boolean;
      refresh: boolean;
      forceRefresh: boolean;
      usageSource: string;
      forceRefreshPath: string | null;
    },
  ): Promise<XPostsContent>;
  isApiError(error: unknown): boolean;
};

export type NaverCafeReader = (
  sources: NaverCafeSourceRecord[],
  options: { cacheDb: D1Database; size: number },
) => Promise<NaverCafePostsContent>;

const normalizeVisibility = (
  value: string | null | undefined,
): Visibility =>
  value === "public" || value === "private" ? value : "members";

export class D1MemberPostsPort implements MemberPostsPort {
  private readonly db: ReturnType<typeof getDb>;
  private readonly env: Env;
  private readonly xFeed: XFeedService;
  private readonly readNaverCafe: NaverCafeReader;

  constructor(
    env: Env,
    xFeed: XFeedService,
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
        sql`${members.is_deprecated} IS NULL OR ${members.is_deprecated} = 0`,
      )
      .orderBy(asc(members.uid));
  }

  listNaverCafeSources() {
    return this.db
      .select()
      .from(naverCafeSources)
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
      adminView: boolean;
    },
  ) {
    return this.xFeed.fetchPosts(handles, {
      bearerToken: this.env.X_BEARER_TOKEN,
      cacheDb: this.env.otw_db,
      maxResults: options.maxResults,
      richXLinkPreviewEnabled: options.richXLinkPreviewEnabled,
      refresh: false,
      forceRefresh: false,
      usageSource: options.adminView ? "member-posts:admin" : "member-posts",
      forceRefreshPath: null,
    });
  }

  isXApiError(error: unknown) {
    return this.xFeed.isApiError(error);
  }

  readNaverCafePosts(sources: NaverCafeSourceRecord[], size: number) {
    return this.readNaverCafe(sources, {
      cacheDb: this.env.otw_db,
      size,
    });
  }
}

export const createD1MemberPostsApplication = (
  env: Env,
  xFeed: XFeedService,
  readNaverCafe: NaverCafeReader,
) => new GetMemberPosts(new D1MemberPostsPort(env, xFeed, readNaverCafe));
