import type {
  NoticeGateway,
  NoticeThumbnailUploadInput,
  NoticeWriteInput,
} from "./ports/notice-gateway";

export class NoticeUseCases {
  private readonly gateway: NoticeGateway;

  constructor(gateway: NoticeGateway) {
    this.gateway = gateway;
  }

  isThumbnailStorageConfigured() {
    return this.gateway.isThumbnailStorageConfigured();
  }

  list(
    includeInactive: boolean,
    type: "notice" | "event" | null,
    today: string,
  ) {
    return this.gateway.list({ includeInactive, type, today });
  }

  create(input: NoticeWriteInput) {
    return this.gateway.create(input);
  }

  update(id: number, input: NoticeWriteInput) {
    return this.gateway.update(id, input);
  }

  remove(id: number) {
    return this.gateway.remove(id);
  }

  feature(id: number) {
    return this.gateway.feature(id);
  }

  uploadThumbnail(input: NoticeThumbnailUploadInput) {
    return this.gateway.uploadThumbnail(input);
  }

  deleteThumbnail(key: string) {
    return this.gateway.deleteThumbnail(key);
  }

  getThumbnailStatus() {
    return this.gateway.getThumbnailStatus();
  }

  cleanupThumbnails() {
    return this.gateway.cleanupThumbnails();
  }
}
