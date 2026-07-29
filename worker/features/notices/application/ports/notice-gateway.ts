import type {
  NoticeDto,
  NoticePublisherType,
  NoticeThumbnailCleanupResponse,
  NoticeThumbnailStatusResponse,
} from "../../../../../contracts/notices";

export interface NoticeWriteInput {
  content: string;
  url: string | null;
  thumbnailUrl: string | null;
  type: string;
  publisherType: NoticePublisherType;
  publisherMemberUid: number | null;
  isActive: boolean;
  startedAt: string | null;
  endedAt: string | null;
}

export type NoticeMutationResult =
  | { status: "success" }
  | { status: "publisher_not_found" }
  | { status: "failed" };

export type NoticeThumbnailDeleteResult =
  | { status: "deleted" }
  | { status: "referenced" }
  | { status: "unavailable" }
  | { status: "failed" };

export type NoticeThumbnailCleanupResult =
  | { status: "unavailable" }
  | {
      status: "complete" | "partial";
      result: NoticeThumbnailCleanupResponse;
    };

export interface NoticeThumbnailUploadInput {
  file: Blob;
  extension: string;
  contentType: string;
}

export interface NoticeGateway {
  isThumbnailStorageConfigured(): boolean;
  list(input: {
    includeInactive: boolean;
    type: "notice" | "event" | null;
    today: string;
  }): Promise<NoticeDto[]>;
  create(input: NoticeWriteInput): Promise<NoticeMutationResult>;
  update(id: number, input: NoticeWriteInput): Promise<NoticeMutationResult>;
  remove(id: number): Promise<NoticeMutationResult>;
  feature(id: number): Promise<boolean>;
  uploadThumbnail(
    input: NoticeThumbnailUploadInput,
  ): Promise<string | null>;
  deleteThumbnail(key: string): Promise<NoticeThumbnailDeleteResult>;
  getThumbnailStatus(): Promise<NoticeThumbnailStatusResponse>;
  cleanupThumbnails(): Promise<NoticeThumbnailCleanupResult>;
}
