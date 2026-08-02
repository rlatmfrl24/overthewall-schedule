import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Cloudflare SEO asset routing", () => {
  it("keeps hashed and profile image assets outside dynamic HTML rewriting", async () => {
    const config = await readFile("wrangler.jsonc", "utf8");
    expect(config).toContain('"binding": "ASSETS"');
    expect(config).toContain('"html_handling": "drop-trailing-slash"');
    expect(config).toContain('"not_found_handling": "404-page"');
    expect(config).toContain('"!/profile/*.webp"');
    expect(config).toContain('"!/profile/signatures/*"');
  });
});
