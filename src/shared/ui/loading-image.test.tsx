// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LoadingImage } from "./loading-image";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("reserves a skeleton until the current image loads and clears it after failure", () => {
  const { rerender } = render(<LoadingImage src="/a.webp" alt="사진" fallback={<span>대체 이미지</span>} />);
  const image = screen.getByAltText("사진");
  expect(image.classList.contains("invisible")).toBe(true);
  expect(image.parentElement?.querySelector("[data-slot=skeleton]")).toBeTruthy();
  fireEvent.error(image);
  expect(screen.getByText("대체 이미지")).toBeTruthy();
  expect(image.classList.contains("invisible")).toBe(true);
  expect(image.parentElement?.querySelector("[data-slot=skeleton]")).toBeNull();

  rerender(<LoadingImage src="/b.webp" alt="사진" />);
  const next = screen.getByAltText("사진");
  expect(next.parentElement?.getAttribute("aria-busy")).toBe("true");
  fireEvent.load(next);
  expect(screen.getByRole("img", { name: "사진" })).toBe(next);
  expect(next.classList.contains("invisible")).toBe(false);
  expect(next.parentElement?.querySelector("[data-slot=skeleton]")).toBeNull();
});

it("reveals an already available image without waiting for another load event", () => {
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(800);
  render(<LoadingImage src="/cached.webp" alt="사진" />);
  expect(screen.getByRole("img", { name: "사진" })).toBe(screen.getByAltText("사진"));
});
