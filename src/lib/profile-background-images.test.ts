import { describe, expect, it } from "vitest";
import {
  PROFILE_BACKGROUND_IMAGE_SIZES,
  buildProfileBackgroundImageSources,
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
});
