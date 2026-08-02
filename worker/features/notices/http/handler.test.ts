import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";

const getDbMock = vi.hoisted(() => vi.fn());
const requireAdminUserMock = vi.hoisted(() => vi.fn());

vi.mock("../../../platform/db", () => ({
  getDb: getDbMock,
}));

vi.mock("../../../platform/auth", () => ({
  requireAdminUser: requireAdminUserMock,
}));

import {
  createHandleNotices,
  D1NoticeGateway,
  NoticeUseCases,
} from "../index";

const handleNotices = createHandleNotices(
  (env) =>
    new NoticeUseCases(
      new D1NoticeGateway(getDbMock(), env.ASSET_BUCKET),
    ),
);

const makeEnv = (overrides: Partial<Env> = {}): Env =>
  ({
    YOUTUBE_API_KEY: "",
    otw_db: {} as D1Database,
    ...overrides,
  }) as Env;

const selectThumbnailQuery = (
  thumbnailUrl: string | null,
  imageUrls: string[] = thumbnailUrl ? [thumbnailUrl] : [],
) => ({
  from: () => ({
    where: () => ({
      limit: async () => [{ image_urls: imageUrls, thumbnail_url: thumbnailUrl }],
    }),
  }),
});

const selectThumbnailReferencesQuery = (thumbnailUrls: string[]) => ({
  from: async () =>
    thumbnailUrls.map((thumbnail_url) => ({
      image_urls: [thumbnail_url],
      thumbnail_url,
    })),
});

const makeDeleteDb = (
  thumbnailUrl: string | null,
  references: string[] = [],
  imageUrls?: string[],
) => ({
  select: vi
    .fn()
    .mockReturnValueOnce(selectThumbnailQuery(thumbnailUrl, imageUrls))
    .mockImplementation(() => selectThumbnailReferencesQuery(references)),
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
    .mockImplementation(() => selectThumbnailReferencesQuery(references)),
  update: vi.fn(() => ({
    set: () => ({
      where: async () => ({ success: true }),
    }),
  })),
});

const makeReadDb = (rows: unknown[] = []) => ({
  update: vi.fn(() => ({
    set: () => ({
      where: async () => ({ success: true }),
    }),
  })),
  select: vi.fn(() => ({
    from: () => ({
      where: () => ({
        orderBy: async () => rows,
      }),
      orderBy: async () => rows,
    }),
  })),
});

const makeCreateDb = () => {
  const values = vi.fn(async () => ({ success: true }));
  return {
    insert: vi.fn(() => ({ values })),
    values,
  };
};

const makeFeaturedDb = (exists = true) => {
  const updates: Array<{ is_featured: boolean }> = [];
  const batch = vi.fn(async () => []);
  return {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => (exists ? [{ id: 8 }] : []),
        }),
      }),
    })),
    update: vi.fn(() => ({
      set: (values: { is_featured: boolean }) => {
        updates.push(values);
        return { where: () => ({}) };
      },
    })),
    batch,
    updates,
  };
};

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

const makeThumbnailStatusRequest = () =>
  new Request("https://example.com/api/notices/thumbnails/status");

const makeThumbnailCleanupRequest = () =>
  new Request("https://example.com/api/notices/thumbnails/cleanup", {
    method: "POST",
  });

const makeR2Object = (key: string, size: number, uploadedAt: number) =>
  ({
    key,
    size,
    uploaded: new Date(uploadedAt),
  }) as R2Object;

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
    const put = vi.fn<
      (
        key: string,
        value: Blob,
        options: R2PutOptions,
      ) => Promise<Record<string, never>>
    >(async () => ({}));

    const response = await handleNotices(
      makeThumbnailUploadRequest(new Blob(["image"], { type: "image/png" })),
      makeEnv({
        ASSET_BUCKET: {
          put,
        } as unknown as R2Bucket,
      }),
    );
    const body = (await response.json()) as { thumbnail_url: string };
    const [key, value, options] = put.mock.calls[0];

    expect(response.status).toBe(201);
    expect(key).toMatch(/^notices\/thumbnails\/\d+-[-a-f0-9]+\.png$/);
    expect(value.type).toBe("image/png");
    expect(options.httpMetadata).toEqual({
      contentType: "image/png",
      cacheControl: "public, max-age=31536000, immutable",
    });
    expect(body.thumbnail_url).toBe(`/r2-assets/${key}`);
  });

  it("returns no-store headers for public notice reads", async () => {
    getDbMock.mockReturnValue(makeReadDb([{ id: 1, content: "notice" }]));

    const response = await handleNotices(
      new Request("https://example.com/api/notices"),
      makeEnv(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns no-store headers for notice mutations", async () => {
    const db = makeCreateDb();
    getDbMock.mockReturnValue(db);

    const response = await handleNotices(
      new Request("https://example.com/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "created",
          type: "notice",
          publisher_type: "otw",
          is_active: true,
          is_featured: true,
        }),
      }),
      makeEnv(),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({ is_active: true, is_featured: false }),
    );
  });

  it("normalizes multi-content payloads and mirrors their first values", async () => {
    const db = makeCreateDb();
    getDbMock.mockReturnValue(db);
    const response = await handleNotices(
      new Request("https://example.com/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "multi",
          type: "event",
          links: [
            { label: "A", url: "https://example.com/a" },
            { label: "B", url: "https://example.com/b" },
          ],
          image_urls: ["/one.webp", "https://img.example.com/two.png"],
          related_member_uids: [],
        }),
      }),
      makeEnv(),
    );

    expect(response.status).toBe(201);
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        links: [
          { label: "A", url: "https://example.com/a" },
          { label: "B", url: "https://example.com/b" },
        ],
        image_urls: ["/one.webp", "https://img.example.com/two.png"],
        related_member_uids: [],
        url: "https://example.com/a",
        thumbnail_url: "/one.webp",
        publisher_type: "otw",
        publisher_member_uid: null,
      }),
    );
  });

  it("promotes legacy single-value payloads into canonical arrays", async () => {
    const db = makeCreateDb();
    getDbMock.mockReturnValue(db);
    const response = await handleNotices(
      new Request("https://example.com/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "legacy",
          type: "notice",
          url: "https://example.com/legacy",
          thumbnail_url: "/legacy.webp",
          publisher_type: "otw",
        }),
      }),
      makeEnv(),
    );

    expect(response.status).toBe(201);
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        links: [{ label: "자세히 보기", url: "https://example.com/legacy" }],
        image_urls: ["/legacy.webp"],
        related_member_uids: [],
      }),
    );
  });

  it.each([
    ["non-http link", { links: [{ label: "bad", url: "mailto:test@example.com" }] }],
    ["duplicate links", { links: [{ label: "A", url: "https://example.com" }, { label: "B", url: "https://example.com" }] }],
    ["too many links", { links: Array.from({ length: 11 }, (_, index) => ({ label: `${index}`, url: `https://example.com/${index}` })) }],
    ["duplicate images", { image_urls: ["/same.webp", "/same.webp"] }],
    ["too many images", { image_urls: Array.from({ length: 11 }, (_, index) => `/image-${index}.webp`) }],
    ["duplicate members", { related_member_uids: [1, 1] }],
  ])("rejects %s", async (_label, invalidPayload) => {
    const response = await handleNotices(
      new Request("https://example.com/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "invalid", type: "notice", ...invalidPayload }),
      }),
      makeEnv(),
    );
    expect(response.status).toBe(400);
  });

  it("rejects inactive or missing related members", async () => {
    getDbMock.mockReturnValue({
      select: vi.fn(() => ({ from: () => ({ where: async () => [] }) })),
    });
    const response = await handleNotices(
      new Request("https://example.com/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "member",
          type: "notice",
          related_member_uids: [999],
        }),
      }),
      makeEnv(),
    );
    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Related member not found");
  });

  it("selects exactly one featured notice in a batch", async () => {
    const db = makeFeaturedDb();
    getDbMock.mockReturnValue(db);

    const response = await handleNotices(
      new Request("https://example.com/api/notices/featured", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: 8 }),
      }),
      makeEnv(),
    );

    expect(response.status).toBe(200);
    expect(db.updates).toEqual([
      { is_featured: false },
      { is_featured: true },
    ]);
    expect(db.batch).toHaveBeenCalledTimes(1);
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
    expect(response.headers.get("Cache-Control")).toBe("no-store");
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
    expect(response.headers.get("Cache-Control")).toBe("no-store");
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
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("cleans up every removed owned image from a deleted notice", async () => {
    const deleteObject = vi.fn(async () => undefined);
    getDbMock.mockReturnValue(
      makeDeleteDb(
        "/r2-assets/notices/thumbnails/one.webp",
        [],
        [
          "/r2-assets/notices/thumbnails/one.webp",
          "/r2-assets/notices/thumbnails/two.webp",
        ],
      ),
    );
    const response = await handleNotices(
      new Request("https://example.com/api/notices?id=9", { method: "DELETE" }),
      makeEnv({ ASSET_BUCKET: { delete: deleteObject } as unknown as R2Bucket }),
    );

    expect(response.status).toBe(200);
    expect(deleteObject).toHaveBeenCalledTimes(2);
    expect(deleteObject).toHaveBeenCalledWith("notices/thumbnails/one.webp");
    expect(deleteObject).toHaveBeenCalledWith("notices/thumbnails/two.webp");
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
    expect(response.headers.get("Cache-Control")).toBe("no-store");
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

  it("reports R2 thumbnail status with unused and missing objects", async () => {
    const now = Date.now();
    const list = vi.fn(async () => ({
      objects: [
        makeR2Object("notices/thumbnails/used.webp", 1200, now - 1000),
        makeR2Object("notices/thumbnails/unused.png", 2400, now - 20 * 60_000),
      ],
      truncated: false,
      cursor: undefined,
      delimitedPrefixes: [],
    }));
    getDbMock.mockReturnValue({
      select: vi.fn(() =>
        selectThumbnailReferencesQuery([
          "/r2-assets/notices/thumbnails/used.webp",
          "/r2-assets/notices/thumbnails/missing.jpg",
          "https://img.example.com/external.png",
        ]),
      ),
    });

    const response = await handleNotices(
      makeThumbnailStatusRequest(),
      makeEnv({
        ASSET_BUCKET: {
          list,
        } as unknown as R2Bucket,
      }),
    );
    const body = (await response.json()) as {
      bucketConfigured: boolean;
      stats: {
        totalObjects: number;
        referencedObjects: number;
        unusedObjects: number;
        missingReferencedObjects: number;
        cleanupEligibleObjects: number;
        unusedBytes: number;
        cleanupEligibleBytes: number;
      };
      objects: Array<{ key: string; referenced: boolean }>;
      missingReferences: Array<{
        key: string;
        referenceCount: number;
        url: string;
      }>;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(requireAdminUserMock).toHaveBeenCalled();
    expect(body.bucketConfigured).toBe(true);
    expect(body.stats).toMatchObject({
      totalObjects: 2,
      referencedObjects: 1,
      unusedObjects: 1,
      missingReferencedObjects: 1,
      cleanupEligibleObjects: 1,
      unusedBytes: 2400,
      cleanupEligibleBytes: 2400,
    });
    expect(body.objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "notices/thumbnails/used.webp",
          referenced: true,
        }),
        expect.objectContaining({
          key: "notices/thumbnails/unused.png",
          referenced: false,
        }),
      ]),
    );
    expect(body.missingReferences).toEqual([
      {
        key: "notices/thumbnails/missing.jpg",
        referenceCount: 1,
        url: "/r2-assets/notices/thumbnails/missing.jpg",
      },
    ]);
  });

  it("deletes only unused R2 thumbnails during cleanup", async () => {
    const now = Date.now();
    const deleteObject = vi.fn(async () => undefined);
    const list = vi.fn(async () => ({
      objects: [
        makeR2Object("notices/thumbnails/used.webp", 1200, now - 1000),
        makeR2Object(
          "notices/thumbnails/unused.png",
          2400,
          now - 20 * 60_000,
        ),
        makeR2Object("notices/thumbnails/recent.png", 3600, now),
      ],
      truncated: false,
      cursor: undefined,
      delimitedPrefixes: [],
    }));
    getDbMock.mockReturnValue({
      select: vi.fn(() =>
        selectThumbnailReferencesQuery([
          "/r2-assets/notices/thumbnails/used.webp",
        ]),
      ),
    });

    const response = await handleNotices(
      makeThumbnailCleanupRequest(),
      makeEnv({
        ASSET_BUCKET: {
          list,
          delete: deleteObject,
        } as unknown as R2Bucket,
      }),
    );
    const body = (await response.json()) as {
      success: boolean;
      deletedCount: number;
      failedCount: number;
      deleted: string[];
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      deletedCount: 1,
      failedCount: 0,
      deleted: ["notices/thumbnails/unused.png"],
    });
    expect(deleteObject).toHaveBeenCalledTimes(1);
    expect(deleteObject).toHaveBeenCalledWith("notices/thumbnails/unused.png");
  });
});
