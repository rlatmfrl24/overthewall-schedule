import { describe, expect, it, vi } from "vitest";
import { handleR2Asset } from "../../../worker/routes/r2-assets";
import type { Env } from "../../../worker/types";

const makeR2Object = () =>
  ({
    body: new Response("asset-body").body,
    httpEtag: '"asset-etag"',
    writeHttpMetadata: (headers: Headers) => {
      headers.set("Content-Type", "text/html");
    },
  }) as R2ObjectBody;

const makeEnv = (get = vi.fn()) =>
  ({
    ASSET_BUCKET: {
      get,
    },
  }) as unknown as Env;

describe("r2 asset route", () => {
  it("serves profile background assets from R2 with long-lived cache headers", async () => {
    const get = vi.fn(async () => makeR2Object());
    const response = await handleR2Asset(
      new Request(
        "https://otw-schedule.info/r2-assets/members/bing_hayu/backgrounds/default/w1280.webp",
      ),
      makeEnv(get),
    );

    expect(get).toHaveBeenCalledWith(
      "members/bing_hayu/backgrounds/default/w1280.webp",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(response.headers.get("ETag")).toBe('"asset-etag"');
    await expect(response.text()).resolves.toBe("asset-body");
  });

  it("returns 404 for unsupported keys", async () => {
    const get = vi.fn(async () => makeR2Object());
    const response = await handleR2Asset(
      new Request("https://otw-schedule.info/r2-assets/private/file.webp"),
      makeEnv(get),
    );

    expect(response.status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });

  it("returns 404 for unsupported member asset variants", async () => {
    const get = vi.fn(async () => makeR2Object());
    const response = await handleR2Asset(
      new Request(
        "https://otw-schedule.info/r2-assets/members/bing_hayu/backgrounds/default/w800.webp",
      ),
      makeEnv(get),
    );

    expect(response.status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });

  it("serves uploaded notice thumbnails with their image content type", async () => {
    const get = vi.fn(async () => makeR2Object());
    const response = await handleR2Asset(
      new Request(
        "https://otw-schedule.info/r2-assets/notices/thumbnails/notice-thumb.png",
      ),
      makeEnv(get),
    );

    expect(get).toHaveBeenCalledWith("notices/thumbnails/notice-thumb.png");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    await expect(response.text()).resolves.toBe("asset-body");
  });

  it("returns 405 for methods other than get and head", async () => {
    const response = await handleR2Asset(
      new Request(
        "https://otw-schedule.info/r2-assets/members/bing_hayu/backgrounds/default/w1280.webp",
        { method: "POST" },
      ),
      makeEnv(),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, HEAD");
  });
});
