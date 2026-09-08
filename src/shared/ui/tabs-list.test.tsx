// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { TabsList } from "./tabs-list";

afterEach(cleanup);
it("키보드 이동에서 비활성 항목을 건너뛰고 선택과 포커스를 함께 이동한다", () => {
  function Example() {
    const [value, setValue] = useState("one");
    return <><TabsList label="보기" value={value} onValueChange={setValue} items={[
      { value: "one", label: "첫째", id: "one", panelId: "one-panel" },
      { value: "two", label: "둘째", id: "two", panelId: "two-panel", disabled: true },
      { value: "three", label: "셋째", id: "three", panelId: "three-panel" },
    ]} /><div id={`${value}-panel`} role="tabpanel" aria-labelledby={value}>내용</div></>;
  }
  render(<Example />);
  const first = screen.getByRole("tab", { name: "첫째" });
  const last = screen.getByRole("tab", { name: "셋째" });
  first.focus();
  fireEvent.keyDown(first, { key: "ArrowRight" });
  expect(document.activeElement).toBe(last);
  expect(last.getAttribute("aria-selected")).toBe("true");
  expect(first.tabIndex).toBe(-1);
  fireEvent.keyDown(last, { key: "Home" });
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first, { key: "End" });
  expect(document.activeElement).toBe(last);
  fireEvent.keyDown(last, { key: "ArrowRight" });
  expect(document.activeElement).toBe(first);
});
