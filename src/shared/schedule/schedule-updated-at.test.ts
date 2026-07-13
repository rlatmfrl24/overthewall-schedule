// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ScheduleUpdatedAt } from "./schedule-updated-at";

describe("ScheduleUpdatedAt", () => {
  afterEach(() => {
    cleanup();
  });

  it("업데이트 시각을 한국 표준시로 명확하게 표시한다", () => {
    render(
      createElement(ScheduleUpdatedAt, {
        updatedAt: "2026-07-13T05:06:00.000Z",
      }),
    );

    expect(
      screen.getByLabelText("최신 업데이트 2026.07.13 14:06"),
    ).toBeTruthy();
    expect(screen.getByText("2026.07.13 14:06")).toBeTruthy();
  });

  it("유효하지 않은 시각은 표시하지 않는다", () => {
    const { container } = render(
      createElement(ScheduleUpdatedAt, { updatedAt: "invalid-date" }),
    );

    expect(container.textContent).toBe("");
  });

  it("스냅샷에서는 최종 편집 정보를 두 줄로 표시할 수 있다", () => {
    render(
      createElement(ScheduleUpdatedAt, {
        updatedAt: "2026-07-13T05:06:00.000Z",
        label: "최종 편집",
        stacked: true,
      }),
    );

    expect(screen.getByLabelText("최종 편집 2026.07.13 14:06")).toBeTruthy();
    expect(screen.getByText("최종 편집")).toBeTruthy();
  });
});
