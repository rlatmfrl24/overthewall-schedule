// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { createElement } from "react";
import { SnapshotPortrait } from "./snapshot-portrait";

afterEach(cleanup);
it("replaces a missing portrait without leaving a broken img that prevents PNG capture", () => {
  const view = render(createElement(SnapshotPortrait, { src: "/profile/missing.webp", alt: "멤버", className: "snapshot-portrait" }));
  fireEvent.error(screen.getByRole("img", { name: "멤버" }));
  expect(view.container.querySelector("img")).toBeNull();
  expect(screen.getByRole("img", { name: "멤버" })).toBeTruthy();
  view.rerender(createElement(SnapshotPortrait, { src: "/profile/available.webp", alt: "멤버", className: "snapshot-portrait" }));
  expect(view.container.querySelector("img")?.getAttribute("src")).toBe("/profile/available.webp");
});
