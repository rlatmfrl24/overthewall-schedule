// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { OtwPlayThumbnail } from "./otw-play-thumbnail";

const source = {
  provider: "youtube" as const,
  externalId: "ASRCBcCY_qE",
  thumbnailUrl: "https://i.ytimg.com/vi/ASRCBcCY_qE/hqdefault.jpg",
};

describe("OtwPlayThumbnail", () => {
  afterEach(cleanup);

  it("prefers the 16:9 max-resolution YouTube image", () => {
    render(
      <OtwPlayThumbnail
        source={source}
        alt="고해상도 곡 썸네일"
        width={960}
        height={540}
      />,
    );
    expect(
      screen
        .getByRole("img", { name: "고해상도 곡 썸네일" })
        .getAttribute("src"),
    ).toBe("https://i.ytimg.com/vi/ASRCBcCY_qE/maxresdefault.jpg");
  });

  it("falls back to the catalog thumbnail when max resolution is unavailable", () => {
    render(
      <OtwPlayThumbnail
        source={source}
        alt="곡 썸네일"
        width={960}
        height={540}
      />,
    );
    const image = screen.getByRole("img", { name: "곡 썸네일" });
    expect(image.getAttribute("src")).toContain("maxresdefault.jpg");
    fireEvent.error(image);
    expect(
      screen.getByRole("img", { name: "곡 썸네일" }).getAttribute("src"),
    ).toBe(source.thumbnailUrl);
  });
});
