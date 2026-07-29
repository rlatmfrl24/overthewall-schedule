import { describe, expect, it } from "vitest";
import {
  PROFILE_BACKGROUND_IMAGE_SIZES,
  buildProfileBackgroundImageSources,
  buildProfileBackgroundImageSourceSets,
  getProfileBackgroundIds,
} from "./profile-background-images";

describe("profile background image sources", () => {
  it("builds local responsive profile background variants", () => {
    const sources = buildProfileBackgroundImageSources("bing_hayu");

    expect(sources.src).toBe(
      "/r2-assets/members/bing_hayu/backgrounds/default/w1280.webp",
    );
    expect(sources.fallbackSrc).toBe(
      "/r2-assets/members/bing_hayu/backgrounds/default/original.webp",
    );
    expect(sources.sizes).toBe(PROFILE_BACKGROUND_IMAGE_SIZES);
    expect(sources.srcSet).toContain(
      "/r2-assets/members/bing_hayu/backgrounds/default/w960.webp 960w",
    );
    expect(sources.srcSet).toContain(
      "/r2-assets/members/bing_hayu/backgrounds/default/w1672.webp 1672w",
    );
  });

  it("supports a Cloudflare asset base URL for R2-backed variants", () => {
    const sources = buildProfileBackgroundImageSources(
      "kurenai_natsuki",
      "https://assets.example.com/",
      "moon-shrine-01",
    );

    expect(sources.src).toBe(
      "https://assets.example.com/members/kurenai_natsuki/backgrounds/moon-shrine-01/w1280.webp",
    );
    expect(sources.fallbackSrc).toBe(
      "https://assets.example.com/members/kurenai_natsuki/backgrounds/moon-shrine-01/original.webp",
    );
  });

  it("falls back to the default background id when no R2 backgrounds are listed", () => {
    expect(getProfileBackgroundIds([])).toEqual(["default"]);
  });

  it("sorts and limits listed R2 background ids", () => {
    expect(
      getProfileBackgroundIds([
        { id: "third", sortOrder: 3 },
        { id: "default", sortOrder: 0 },
        { id: "second", sortOrder: 2 },
        { id: "fourth", sortOrder: 4 },
      ]),
    ).toEqual(["default", "second", "third"]);
  });

  it("builds multiple background source sets for carousel use", () => {
    const sourceSets = buildProfileBackgroundImageSourceSets("bing_hayu", [
      { id: "default", sortOrder: 0 },
      { id: "stage-night", sortOrder: 1, version: "etag-stage-night" },
    ]);

    expect(sourceSets.map((set) => set.id)).toEqual([
      "default",
      "stage-night",
    ]);
    expect(sourceSets[1]?.sources.src).toBe(
      "/r2-assets/members/bing_hayu/backgrounds/stage-night/w1280.webp?v=etag-stage-night",
    );
    expect(sourceSets[1]?.sources.srcSet).toContain(
      "/r2-assets/members/bing_hayu/backgrounds/stage-night/w960.webp?v=etag-stage-night 960w",
    );
  });
});
