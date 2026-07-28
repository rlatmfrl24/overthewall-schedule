export type NoticePublisherType = "otw" | "member";

export interface NoticeDto {
  id: number;
  content: string;
  url: string | null;
  thumbnail_url: string | null;
  type: string;
  publisher_type: string;
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
  url?: string | null;
  thumbnail_url?: string | null;
  type: NoticeDto["type"];
  publisher_type?: NoticePublisherType;
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
