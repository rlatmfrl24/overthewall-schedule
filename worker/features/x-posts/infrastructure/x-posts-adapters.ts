import type { XPostDto, XPostsByHandleDto } from "@contracts/x-posts";
import { getDb } from "../../../platform/db";
import {
  insertAdminAuditLog,
} from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";
import {
  createXPostsApplication,
  XPostFeedError,
} from "../application/x-posts-service";
import { readActiveXHandles } from "./d1-active-handles";
import {
  extractXHandleFromUrl,
  fetchXPostPreviewById,
  fetchXPostsForHandles,
  readStoredXReplyReference,
  redactStoredXPosts,
  XApiError,
} from "./x-api";
import { runXCollection } from "./x-collection";
import { readXSetting } from "./x-settings";

export const buildXPostsApplication = (env: Env) => {
  const db = getDb(env);

  const mapApiError = (error: unknown) => {
    if (error instanceof XApiError) {
      throw new XPostFeedError(error.message, error.status, {
        code: error.code,
        sourceStatus: error.sourceStatus,
        detail: error.detail,
        diagnostics: error.diagnostics,
      });
    }
    throw error;
  };

  return createXPostsApplication({
    readSetting: (key) => readXSetting(env.otw_db, key),
    readAllowedHandles: () => readActiveXHandles(env.otw_db),
    fetchPosts: async (handles, options) => {
      try {
        return await fetchXPostsForHandles(handles, {
          bearerToken: env.X_BEARER_TOKEN,
          cacheDb: env.otw_db,
          maxResults: options.maxResults,
          richXLinkPreviewEnabled: options.richXLinkPreviewEnabled,
          refresh: options.refresh,
        });
      } catch (error) {
        return mapApiError(error);
      }
    },
    readStoredReplyReference: (sourcePostId) =>
      readStoredXReplyReference(env.otw_db, sourcePostId),
    fetchPostPreview: async (postId) => {
      try {
        return await fetchXPostPreviewById(postId, {
          bearerToken: env.X_BEARER_TOKEN,
          cacheDb: env.otw_db,
          usageSource: "reply-context",
        });
      } catch (error) {
        if (error instanceof XApiError) {
          throw new XPostFeedError(
            error.message,
            error.status === 429 ? 429 : 502,
            {
              code: error.code,
              sourceStatus: error.sourceStatus,
              detail: error.detail,
              diagnostics: error.diagnostics,
            },
          );
        }
        throw error;
      }
    },
    redactStoredPost: async (postId) =>
      (await redactStoredXPosts(env.otw_db, [postId], "admin")).redacted > 0,
    writePostRedactionAudit: async (postId, actor, changed) => {
      await insertAdminAuditLog(db, {
        eventType: "x_post.redacted",
        resourceType: "x_post",
        resourceId: postId,
        action: "redact",
        status: changed ? "success" : "skipped",
        actorId: actor.actorId,
        actorName: actor.actorName,
        actorIp: actor.actorIp,
        targetCount: 1,
        successCount: changed ? 1 : 0,
        failureCount: 0,
        detail: { reason: "admin" },
      });
    },
    runCollection: () => runXCollection(env, "manual"),
    writeCollectionAudit: async (input) => {
      await insertAdminAuditLog(db, {
        eventType: "manual_collection.x",
        resourceType: "x_collection",
        action: "run_now",
        status: input.status,
        actorId: input.actorId,
        actorName: input.actorName,
        actorIp: input.actorIp,
        targetCount: input.targetCount,
        successCount: input.successCount,
        failureCount: input.failureCount,
        detail: input.detail,
        error: input.error,
      });
    },
    warn: (message, error) => console.warn(message, error),
  });
};

export type XPostFeedServiceOptions = {
  bearerToken?: string;
  cacheDb: D1Database;
  maxResults: number;
  richXLinkPreviewEnabled: boolean;
  refresh: boolean;
  forceRefresh: boolean;
  usageSource: string;
  forceRefreshPath: string | null;
};

export interface XPostFeedService {
  extractHandle(value: string | null | undefined): string | null;
  fetchPosts(
    handles: string[],
    options: XPostFeedServiceOptions,
  ): Promise<{
    posts: XPostDto[];
    byHandle: XPostsByHandleDto[];
  }>;
  isApiError(error: unknown): boolean;
}

export const xPostFeedService: XPostFeedService = {
  extractHandle: (value) => extractXHandleFromUrl(value),
  fetchPosts: (handles, options) =>
    fetchXPostsForHandles(handles, {
      bearerToken: options.bearerToken,
      cacheDb: options.cacheDb,
      maxResults: options.maxResults,
      richXLinkPreviewEnabled: options.richXLinkPreviewEnabled,
      refresh: options.refresh,
      forceRefresh: options.forceRefresh,
      usageSource: options.usageSource,
      forceRefreshPath: options.forceRefreshPath,
    }),
  isApiError: (error) => error instanceof XApiError,
};
