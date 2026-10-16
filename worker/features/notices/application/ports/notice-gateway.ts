import type {
  NoticeDto,
  NoticeThumbnailCleanupResponse,
  NoticeThumbnailStatusResponse,
} from "../../../../../contracts/notices";

import type { NoticeWriteInput } from "../../domain/notice-command";
export type { NoticeWriteInput } from "../../domain/notice-command";

export type NoticeMutationResult =
  | { status: "success" }
  | { status: "related_member_not_found" }
  | { status: "failed" };

export type NoticeThumbnailDeleteResult =
  | { status: "deleted" }
  | { status: "referenced" }
  | { status: "retained" }
  | { status: "unavailable" }
  | { status: "failed" };

export type NoticeThumbnailCleanupResult =
  | { status: "unavailable" }
  | {
      status: "complete" | "partial";
      result: NoticeThumbnailCleanupResponse;
    };

export interface NoticeThumbnailUploadInput {
  operationId: string;
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
