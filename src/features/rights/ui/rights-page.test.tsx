// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RightsPage } from "./rights-page";

afterEach(() => cleanup());

describe("RightsPage", () => {
  it("makes image recognition terms and provider policies available outside the editor", () => {
    render(<RightsPage />);
    expect(screen.getByRole("heading",{name:"AI 이미지 인식 이용약관"}).id).toBe("schedule-image-terms");
    expect(screen.getByText(/원본 이미지와 확대 이미지/)).toBeTruthy();
    expect(screen.getByRole("link",{name:"OpenRouter 데이터 처리 정책"}).getAttribute("href")).toBe("https://openrouter.ai/docs/guides/privacy/provider-logging");
    expect(screen.getByRole("link",{name:"Google Gemini API 약관"}).getAttribute("href")).toBe("https://aistudio.google.com/docs/terms");
  });
  it("shows the current web rights notice without the removed extension policy", () => {
    render(<RightsPage />);

    expect(
      screen.getByRole("heading", { name: "저작권 및 권리 안내" }),
    ).toBeTruthy();
    expect(screen.getByText("사이트 자체 제작물")).toBeTruthy();
    expect(screen.getByText("제3자 콘텐츠 및 상표")).toBeTruthy();
    expect(screen.getByText("외부 콘텐츠 사용 범위")).toBeTruthy();
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(screen.queryByText("CHZZK / NAVER Cafe")).toBeNull();
    expect(screen.queryByText(/OTW Schedule \+ 개인정보/)).toBeNull();
  });

  it("provides direct rights contact paths", () => {
    render(<RightsPage />);

    expect(
      screen.getByRole("link", { name: "397love@gmail.com" }).getAttribute("href"),
    ).toBe("mailto:397love@gmail.com");
    expect(
      screen.getByRole("link", { name: /GitHub 이슈/ }).getAttribute("href"),
    ).toBe("https://github.com/rlatmfrl24/overthewall-schedule/issues");
    expect(
      screen.getByText(/개인정보나 권리 입증 자료는 공개 GitHub 이슈에 올리지 말고/),
    ).toBeTruthy();
  });
});
