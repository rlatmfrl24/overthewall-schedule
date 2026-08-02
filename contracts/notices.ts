export type NoticePublisherType = "otw" | "member";

export const MAX_NOTICE_LINKS = 10;
export const MAX_NOTICE_IMAGES = 10;

export interface NoticeLinkDto {
  label: string;
  url: string;
}

export interface NoticeDto {
  id: number;
  content: string;
  links: NoticeLinkDto[];
  image_urls: string[];
  related_member_uids: number[];
  /** @deprecated Use links. */
  url: string | null;
  /** @deprecated Use image_urls. */
  thumbnail_url: string | null;
  type: string;
  /** @deprecated Notices are published by OTW; use related_member_uids. */
  publisher_type: string;
  /** @deprecated Use related_member_uids. */
  publisher_member_uid: number | null;
  is_active: boolean | string | number | null;
  is_featured: boolean | string | number | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string | number | null;
}

export interface NoticePayload {
  id?: number;
  content: string;
  links?: NoticeLinkDto[];
  image_urls?: string[];
  related_member_uids?: number[];
  /** @deprecated Legacy single-link input. */
  url?: string | null;
  /** @deprecated Legacy single-image input. */
  thumbnail_url?: string | null;
  type: NoticeDto["type"];
  /** @deprecated Legacy member publisher input. */
  publisher_type?: NoticePublisherType;
  /** @deprecated Legacy member publisher input. */
  publisher_member_uid?: number | null;
  started_at?: string | null;
  ended_at?: string | null;
  is_active: boolean | string | number;
}

export interface NoticeThumbnailUploadResponse {
  thumbnail_url: string;
}

export interface NoticeThumbnailDeleteResponse {
  deleted: boolean;
  reason?: "referenced";
}

export interface NoticeThumbnailAssetStatus {
  key: string;
  url: string;
  size: number;
  uploadedAt: number | null;
  referenced: boolean;
  referenceCount: number;
  cleanupEligible: boolean;
}

export interface NoticeThumbnailReferenceStatus {
  key: string;
  url: string;
  referenceCount: number;
}

export interface NoticeThumbnailStatusResponse {
  updatedAt: string;
  bucketConfigured: boolean;
  prefix: string;
  maxBytes: number;
  stats: {
    totalObjects: number;
    referencedObjects: number;
    unusedObjects: number;
    missingReferencedObjects: number;
    cleanupEligibleObjects: number;
    totalBytes: number;
    unusedBytes: number;
    cleanupEligibleBytes: number;
  };
  objects: NoticeThumbnailAssetStatus[];
  missingReferences: NoticeThumbnailReferenceStatus[];
}

export interface NoticeThumbnailCleanupResponse {
  success: boolean;
  deletedCount: number;
  failedCount: number;
  deleted: string[];
  failed: Array<{ key: string; error: string }>;
  before: NoticeThumbnailStatusResponse["stats"];
}
