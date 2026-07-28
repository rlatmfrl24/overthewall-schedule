import { and, eq, sql, type SQL } from "drizzle-orm";
import { members, notices } from "@db/schema";
import type {
  NoticeDto,
  NoticeThumbnailStatusResponse,
} from "../../../../contracts/notices";
import {
  buildNoticeThumbnailAssetUrl,
  getOwnedNoticeThumbnailKey,
  NOTICE_THUMBNAIL_KEY_PREFIX,
  NOTICE_THUMBNAIL_MAX_BYTES,
} from "../../assets";
import type { DbInstance } from "../../../platform/db";
import type {
  NoticeGateway,
  NoticeMutationResult,
  NoticeThumbnailCleanupResult,
  NoticeThumbnailDeleteResult,
  NoticeThumbnailUploadInput,
  NoticeWriteInput,
} from "../application/ports/notice-gateway";

const NOTICE_THUMBNAIL_CACHE_CONTROL =
  "public, max-age=31536000, immutable";
const NOTICE_THUMBNAIL_CLEANUP_GRACE_MS = 15 * 60_000;

type NoticeThumbnailReference = {
  key: string;
  url: string;
  referenceCount: number;
};

const getR2ObjectUploadedAt = (object: R2Object) =>
  object.uploaded instanceof Date ? object.uploaded.getTime() : null;

export class D1NoticeGateway implements NoticeGateway {
  private readonly db: DbInstance;
  private readonly bucket?: R2Bucket;

  constructor(
    db: DbInstance,
    bucket?: R2Bucket,
  ) {
    this.db = db;
    this.bucket = bucket;
  }

  isThumbnailStorageConfigured() {
    return Boolean(this.bucket);
  }

  async list(input: {
    includeInactive: boolean;
    type: "notice" | "event" | null;
    today: string;
  }): Promise<NoticeDto[]> {
    const filters: SQL[] = [];
    if (!input.includeInactive) {
      filters.push(eq(notices.is_active, true));
      filters.push(
        sql`(${notices.started_at} IS NULL OR ${notices.started_at} <= ${input.today})`,
      );
      filters.push(
        sql`(${notices.ended_at} IS NULL OR ${notices.ended_at} >= ${input.today})`,
      );
    }
    if (input.type) filters.push(eq(notices.type, input.type));

    const baseStatement = this.db.select().from(notices);
    const filteredStatement =
      filters.length > 0 ? baseStatement.where(and(...filters)) : baseStatement;
    return (await filteredStatement.orderBy(notices.id)) as NoticeDto[];
  }

  async create(input: NoticeWriteInput): Promise<NoticeMutationResult> {
    if (!(await this.isPublisherValid(input))) {
      return { status: "publisher_not_found" };
    }
    const result = await this.db.insert(notices).values({
      content: input.content,
      url: input.url,
      thumbnail_url: input.thumbnailUrl,
      type: input.type,
      publisher_type: input.publisherType,
      publisher_member_uid: input.publisherMemberUid,
      is_active: input.isActive,
      is_featured: false,
      started_at: input.startedAt,
      ended_at: input.endedAt,
    });
    return { status: result.success ? "success" : "failed" };
  }

  async update(
    id: number,
    input: NoticeWriteInput,
  ): Promise<NoticeMutationResult> {
    if (!(await this.isPublisherValid(input))) {
      return { status: "publisher_not_found" };
    }
    const previousRows = await this.db
      .select({ thumbnail_url: notices.thumbnail_url })
      .from(notices)
      .where(eq(notices.id, id))
      .limit(1);
    const result = await this.db
      .update(notices)
      .set({
        content: input.content,
        url: input.url,
        thumbnail_url: input.thumbnailUrl,
        type: input.type,
        publisher_type: input.publisherType,
        publisher_member_uid: input.publisherMemberUid,
        is_active: input.isActive,
        started_at: input.startedAt,
        ended_at: input.endedAt,
      })
      .where(eq(notices.id, id));

    if (!result.success) return { status: "failed" };
    await this.deleteThumbnailIfUnused(
      previousRows[0]?.thumbnail_url,
      input.thumbnailUrl,
    );
    return { status: "success" };
  }

  async remove(id: number): Promise<NoticeMutationResult> {
    const previousRows = await this.db
      .select({ thumbnail_url: notices.thumbnail_url })
      .from(notices)
      .where(eq(notices.id, id))
      .limit(1);
    const result = await this.db.delete(notices).where(eq(notices.id, id));
    if (!result.success) return { status: "failed" };
    await this.deleteThumbnailIfUnused(previousRows[0]?.thumbnail_url);
    return { status: "success" };
  }

  async feature(id: number): Promise<boolean> {
    const existingRows = await this.db
      .select({ id: notices.id })
      .from(notices)
      .where(eq(notices.id, id))
      .limit(1);
    if (!existingRows[0]) return false;

    await this.db.batch([
      this.db.update(notices).set({ is_featured: false }),
      this.db
        .update(notices)
        .set({ is_featured: true })
        .where(eq(notices.id, id)),
    ]);
    return true;
  }

  async uploadThumbnail(
    input: NoticeThumbnailUploadInput,
  ): Promise<string | null> {
    if (!this.bucket) return null;
    const key = `${NOTICE_THUMBNAIL_KEY_PREFIX}${Date.now()}-${crypto.randomUUID()}.${
      input.extension
    }`;
    await this.bucket.put(key, input.file, {
      httpMetadata: {
        contentType: input.contentType,
        cacheControl: NOTICE_THUMBNAIL_CACHE_CONTROL,
      },
    });
    return buildNoticeThumbnailAssetUrl(key);
  }

  async deleteThumbnail(key: string): Promise<NoticeThumbnailDeleteResult> {
    if (await this.hasThumbnailReference(key)) {
      return { status: "referenced" };
    }
    if (!this.bucket) return { status: "unavailable" };

    try {
      await this.bucket.delete(key);
      return { status: "deleted" };
    } catch (error) {
      console.warn("[notices] Failed to delete unused notice thumbnail", {
        key,
        error,
      });
      return { status: "failed" };
    }
  }

  async getThumbnailStatus(): Promise<NoticeThumbnailStatusResponse> {
    return this.buildThumbnailStatus();
  }

  async cleanupThumbnails(): Promise<NoticeThumbnailCleanupResult> {
    if (!this.bucket) return { status: "unavailable" };

    const status = await this.buildThumbnailStatus();
    const candidates = status.objects.filter(
      (asset) => asset.cleanupEligible,
    );
    const deleted: string[] = [];
    const failed: Array<{ key: string; error: string }> = [];

    for (const asset of candidates) {
      try {
        await this.bucket.delete(asset.key);
        deleted.push(asset.key);
      } catch (error) {
        failed.push({
          key: asset.key,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return {
      status: failed.length > 0 ? "partial" : "complete",
      result: {
        success: failed.length === 0,
        deletedCount: deleted.length,
        failedCount: failed.length,
        deleted,
        failed,
        before: status.stats,
      },
    };
  }

  private async isPublisherValid(input: NoticeWriteInput) {
    if (input.publisherType === "otw") return true;
    if (input.publisherMemberUid === null) return false;

    const rows = await this.db
      .select({ uid: members.uid })
      .from(members)
      .where(
        and(
          eq(members.uid, input.publisherMemberUid),
          sql`(${members.is_deprecated} IS NULL OR ${members.is_deprecated} = 0)`,
        ),
      )
      .limit(1);
    return Boolean(rows[0]);
  }

  private async getThumbnailReferenceCounts() {
    const rows = await this.db
      .select({ thumbnail_url: notices.thumbnail_url })
      .from(notices)
      .where(sql`${notices.thumbnail_url} IS NOT NULL`);
    const references = new Map<string, NoticeThumbnailReference>();

    for (const row of rows) {
      const key = getOwnedNoticeThumbnailKey(row.thumbnail_url);
      if (!key) continue;
      const existing = references.get(key);
      references.set(key, {
        key,
        url: buildNoticeThumbnailAssetUrl(key),
        referenceCount: (existing?.referenceCount ?? 0) + 1,
      });
    }
    return references;
  }

  private async hasThumbnailReference(key: string) {
    return (await this.getThumbnailReferenceCounts()).has(key);
  }

  private async listThumbnailObjects() {
    if (!this.bucket) return [];
    const objects: R2Object[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.bucket.list({
        prefix: NOTICE_THUMBNAIL_KEY_PREFIX,
        cursor,
        limit: 1000,
      });
      objects.push(...page.objects);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return objects;
  }

  private async buildThumbnailStatus(): Promise<NoticeThumbnailStatusResponse> {
    const references = await this.getThumbnailReferenceCounts();
    if (!this.bucket) {
      return {
        updatedAt: new Date().toISOString(),
        bucketConfigured: false,
        prefix: NOTICE_THUMBNAIL_KEY_PREFIX,
        maxBytes: NOTICE_THUMBNAIL_MAX_BYTES,
        stats: {
          totalObjects: 0,
          referencedObjects: 0,
          unusedObjects: 0,
          missingReferencedObjects: references.size,
          cleanupEligibleObjects: 0,
          totalBytes: 0,
          unusedBytes: 0,
          cleanupEligibleBytes: 0,
        },
        objects: [],
        missingReferences: Array.from(references.values()),
      };
    }

    const objects = await this.listThumbnailObjects();
    const now = Date.now();
    const objectKeys = new Set(objects.map((object) => object.key));
    const assets = objects
      .map((object) => {
        const referenceCount =
          references.get(object.key)?.referenceCount ?? 0;
        const uploadedAt = getR2ObjectUploadedAt(object);
        return {
          key: object.key,
          url: buildNoticeThumbnailAssetUrl(object.key),
          size: object.size,
          uploadedAt,
          referenced: referenceCount > 0,
          referenceCount,
          cleanupEligible:
            referenceCount === 0 &&
            uploadedAt !== null &&
            now - uploadedAt >= NOTICE_THUMBNAIL_CLEANUP_GRACE_MS,
        };
      })
      .sort((a, b) => (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0));
    const unusedObjects = assets.filter((asset) => !asset.referenced);
    const cleanupEligibleObjects = unusedObjects.filter(
      (asset) => asset.cleanupEligible,
    );
    const missingReferences = Array.from(references.values()).filter(
      (reference) => !objectKeys.has(reference.key),
    );

    return {
      updatedAt: new Date().toISOString(),
      bucketConfigured: true,
      prefix: NOTICE_THUMBNAIL_KEY_PREFIX,
      maxBytes: NOTICE_THUMBNAIL_MAX_BYTES,
      stats: {
        totalObjects: assets.length,
        referencedObjects: assets.filter((asset) => asset.referenced).length,
        unusedObjects: unusedObjects.length,
        missingReferencedObjects: missingReferences.length,
        cleanupEligibleObjects: cleanupEligibleObjects.length,
        totalBytes: assets.reduce((sum, asset) => sum + asset.size, 0),
        unusedBytes: unusedObjects.reduce(
          (sum, asset) => sum + asset.size,
          0,
        ),
        cleanupEligibleBytes: cleanupEligibleObjects.reduce(
          (sum, asset) => sum + asset.size,
          0,
        ),
      },
      objects: assets,
      missingReferences,
    };
  }

  private async deleteThumbnailIfUnused(
    thumbnailUrl?: string | null,
    replacementUrl?: string | null,
  ) {
    const key = getOwnedNoticeThumbnailKey(thumbnailUrl);
    if (!key || key === getOwnedNoticeThumbnailKey(replacementUrl)) return;
    if (await this.hasThumbnailReference(key)) return;
    if (!this.bucket) {
      console.warn(
        "[notices] R2 asset bucket is not configured for thumbnail cleanup",
      );
      return;
    }

    try {
      await this.bucket.delete(key);
    } catch (error) {
      console.warn("[notices] Failed to delete notice thumbnail", {
        key,
        error,
      });
    }
  }
}
