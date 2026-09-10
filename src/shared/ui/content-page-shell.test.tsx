// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ContentPageShell } from "./content-page-shell";

afterEach(cleanup);
it("기본 공지·VOD 헤더는 스크롤 바깥에 유지한다", () => {
  const { container } = render(<ContentPageShell title="콘텐츠" controls={<button>필터</button>}>목록</ContentPageShell>);
  const scroll = container.querySelector('[data-slot="content-scroll"]')!;
  expect(scroll.contains(screen.getByRole("heading"))).toBe(false);
  expect(scroll.contains(screen.getByRole("button", { name: "필터" }))).toBe(false);
  expect(scroll.contains(screen.getByText("목록"))).toBe(true);
});
it("선택적 스크롤 헤더·고정 필터·푸터는 순서대로 한 번씩 표시한다", () => {
  const { container } = render(<ContentPageShell title="피드" headerPlacement="scroll" stickyControls={<button>출처</button>} footer={<footer>권리 안내</footer>}>글</ContentPageShell>);
  const scroll = container.querySelector('[data-slot="content-scroll"]')!;
  expect(scroll.contains(screen.getByRole("heading"))).toBe(true);
  expect(scroll.lastElementChild).toBe(screen.getByRole("contentinfo"));
  expect(screen.getAllByText("권리 안내")).toHaveLength(1);
  expect(container.querySelector('[data-slot="sticky-controls"]')?.contains(screen.getByRole("button"))).toBe(true);
});
