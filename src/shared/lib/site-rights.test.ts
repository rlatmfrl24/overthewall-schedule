import { describe, expect, it } from "vitest";
import {
  getSiteCopyrightNotice,
  SITE_COPYRIGHT_OWNER,
  SITE_COPYRIGHT_START_YEAR,
} from "./site-rights";

describe("site rights notice", () => {
  it("uses the first publication year when it is still current", () => {
    expect(getSiteCopyrightNotice(2025)).toBe(
      "© 2025 OTW Schedule. All rights reserved.",
    );
  });

  it("uses a year range after the first publication year", () => {
    expect(getSiteCopyrightNotice(2026)).toBe(
      "© 2025–2026 OTW Schedule. All rights reserved.",
    );
    expect(SITE_COPYRIGHT_START_YEAR).toBe(2025);
    expect(SITE_COPYRIGHT_OWNER).toBe("OTW Schedule");
  });
});
