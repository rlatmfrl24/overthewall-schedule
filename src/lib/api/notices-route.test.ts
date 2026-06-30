import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../worker/types";

const getDbMock = vi.hoisted(() => vi.fn());
const requireAdminUserMock = vi.hoisted(() => vi.fn());

vi.mock("../../../worker/db", () => ({
  getDb: getDbMock,
}));

vi.mock("../../../worker/auth", () => ({
  requireAdminUser: requireAdminUserMock,
}));

import { handleNotices } from "../../../worker/routes/notices";

const makeEnv = (overrides: Partial<Env> = {}): Env =>
  ({
    YOUTUBE_API_KEY: "",
    otw_db: {} as D1Database,
    ...overrides,
  }) as Env;

const selectThumbnailQuery = (thumbnailUrl: string | null) => ({
  from: () => ({
    where: () => ({
      limit: async () => [{ thumbnail_url: thumbnailUrl }],
    }),
  }),
});

const selectThumbnailReferencesQuery = (thumbnailUrls: string[]) => ({
  from: () => ({
    where: async () =>
      thumbnailUrls.map((thumbnail_url) => ({ thumbnail_url })),
  }),
});

const makeDeleteDb = (
  thumbnailUrl: string | null,
  references: string[] = [],
) => ({
  select: vi
    .fn()
    .mockReturnValueOnce(selectThumbnailQuery(thumbnailUrl))
    .mockReturnValueOnce(selectThumbnailReferencesQuery(references)),
  delete: vi.fn(() => ({
    where: async () => ({ success: true }),
  })),
});

const makeUpdateDb = (
  thumbnailUrl: string | null,
  references: string[] = [],
) => ({
  select: vi
    .fn()
    .mockReturnValueOnce(selectThumbnailQuery(thumbnailUrl))
    .mockReturnValueOnce(selectThumbnailReferencesQuery(references)),
  update: vi.fn(() => ({
    set: () => ({
      where: async () => ({ success: true }),
    }),
  })),
});

const makeThumbnailUploadRequest = (blob: Blob, filename = "thumb.png") => {
  const formData = new FormData();
  formData.append("file", blob, filename);
  return new Request("https://example.com/api/notices/thumbnail", {
    method: "POST",
    body: formData,
  });
};

const makeThumbnailDeleteRequest = (thumbnailUrl: string) =>
  new Request("https://example.com/api/notices/thumbnail", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thumbnail_url: thumbnailUrl }),
  });

describe("notices route thumbnail handling", () => {
  beforeEach(() => {
    getDbMock.mockReset();
    requireAdminUserMock.mockReset();
    requireAdminUserMock.mockResolvedValue({
      ok: true,
      user: { id: "admin", displayName: "Admin", sessionId: null, claims: {} },
    });
  });

  it("uploads notice thumbnails into the configured R2 asset bucket", async () => {
    const put = vi.fn(async () => ({}));

    const response = await handleNotices(
      makeThumbnailUploadRequest(new Blob(["image"], { type: "image/png" })),
      makeEnv({
        ASSET_BUCKET: {
          put,
        } as unknown as R2Bucket,
      }),
    );
    const body = (await response.json()) as { thumbnail_url: string };
    const [key, value, options] = put.mock.calls[0] as [
      string,
      Blob,
      R2PutOptions,
    ];

    expect(response.status).toBe(201);
    expect(key).toMatch(/^notices\/thumbnails\/\d+-[-a-f0-9]+\.png$/);
    expect(value.type).toBe("image/png");
    expect(options.httpMetadata).toEqual({
      contentType: "image/png",
      cacheControl: "public, max-age=31536000, immutable",
    });
    expect(body.thumbnail_url).toBe(`/r2-assets/${key}`);
  });

  it("rejects oversized thumbnail uploads before storing them", async () => {
    const put = vi.fn(async () => ({}));
    const response = await handleNotices(
      makeThumbnailUploadRequest(
        new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], {
          type: "image/png",
        }),
      ),
      makeEnv({
        ASSET_BUCKET: {
          put,
        } as unknown as R2Bucket,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Thumbnail file is too large");
    expect(put).not.toHaveBeenCalled();
  });

  it("deletes an owned R2 thumbnail when a notice is deleted", async () => {
    const deleteObject = vi.fn(async () => undefined);
    getDbMock.mockReturnValue(
      makeDeleteDb("/r2-assets/notices/thumbnails/owned.webp"),
    );

    const response = await handleNotices(
      new Request("https://example.com/api/notices?id=9", { method: "DELETE" }),
      makeEnv({
        ASSET_BUCKET: {
          delete: deleteObject,
        } as unknown as R2Bucket,
      }),
    );

    expect(response.status).toBe(200);
    expect(deleteObject).toHaveBeenCalledWith("notices/thumbnails/owned.webp");
  });

  it("does not delete an owned thumbnail that another notice still references", async () => {
    const deleteObject = vi.fn(async () => undefined);
    getDbMock.mockReturnValue(
      makeDeleteDb("/r2-assets/notices/thumbnails/shared.webp", [
        "/r2-assets/notices/thumbnails/shared.webp",
      ]),
    );

    const response = await handleNotices(
      new Request("https://example.com/api/notices?id=9", { method: "DELETE" }),
      makeEnv({
        ASSET_BUCKET: {
          delete: deleteObject,
        } as unknown as R2Bucket,
      }),
    );

    expect(response.status).toBe(200);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("does not delete external thumbnail URLs", async () => {
    const deleteObject = vi.fn(async () => undefined);
    getDbMock.mockReturnValue(makeDeleteDb("https://img.example.com/thumb.png"));

    const response = await handleNotices(
      new Request("https://example.com/api/notices?id=9", { method: "DELETE" }),
      makeEnv({
        ASSET_BUCKET: {
          delete: deleteObject,
        } as unknown as R2Bucket,
      }),
    );

    expect(response.status).toBe(200);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("cleans up the old owned thumbnail when it is replaced", async () => {
    const deleteObject = vi.fn(async () => undefined);
    getDbMock.mockReturnValue(
      makeUpdateDb("/r2-assets/notices/thumbnails/old.jpg"),
    );

    const response = await handleNotices(
      new Request("https://example.com/api/notices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: 9,
          content: "updated",
          type: "notice",
          publisher_type: "otw",
          is_active: true,
          thumbnail_url: "https://img.example.com/new.jpg",
        }),
      }),
      makeEnv({
        ASSET_BUCKET: {
          delete: deleteObject,
        } as unknown as R2Bucket,
      }),
    );

    expect(response.status).toBe(200);
    expect(deleteObject).toHaveBeenCalledWith("notices/thumbnails/old.jpg");
  });

  it("deletes an uploaded thumbnail cleanup request when it is unused", async () => {
    const deleteObject = vi.fn(async () => undefined);
    getDbMock.mockReturnValue({
      select: vi.fn(() => selectThumbnailReferencesQuery([])),
    });

    const response = await handleNotices(
      makeThumbnailDeleteRequest("/r2-assets/notices/thumbnails/uploaded.png"),
      makeEnv({
        ASSET_BUCKET: {
          delete: deleteObject,
        } as unknown as R2Bucket,
      }),
    );

    await expect(response.json()).resolves.toEqual({ deleted: true });
    expect(deleteObject).toHaveBeenCalledWith(
      "notices/thumbnails/uploaded.png",
    );
  });

  it("keeps an uploaded thumbnail cleanup request when a notice references it", async () => {
    const deleteObject = vi.fn(async () => undefined);
    getDbMock.mockReturnValue({
      select: vi.fn(() =>
        selectThumbnailReferencesQuery([
          "/r2-assets/notices/thumbnails/referenced.png",
        ]),
      ),
    });

    const response = await handleNotices(
      makeThumbnailDeleteRequest(
        "/r2-assets/notices/thumbnails/referenced.png",
      ),
      makeEnv({
        ASSET_BUCKET: {
          delete: deleteObject,
        } as unknown as R2Bucket,
      }),
    );

    await expect(response.json()).resolves.toEqual({
      deleted: false,
      reason: "referenced",
    });
    expect(deleteObject).not.toHaveBeenCalled();
  });
});
