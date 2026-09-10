// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogSearchInput } from "./catalog-search-input";

afterEach(cleanup);

describe("CatalogSearchInput", () => {
  it("keeps Korean composition local until the syllable is committed", () => {
    const onSearch = vi.fn();
    const page = render(<CatalogSearchInput value="" onSearch={onSearch} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.compositionStart(input);
    for (const value of ["ㅎ", "하", "한"]) {
      fireEvent.change(input, { target: { value } });
      page.rerender(<CatalogSearchInput value="" onSearch={onSearch} />);
      expect(input.value).toBe(value);
    }
    expect(onSearch).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    expect(onSearch).toHaveBeenLastCalledWith("한");
    page.rerender(<CatalogSearchInput value="한" onSearch={onSearch} />);
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "한글" } });
    expect(onSearch).toHaveBeenCalledTimes(1);
    fireEvent.compositionEnd(input);
    expect(onSearch).toHaveBeenLastCalledWith("한글");
  });

  it("applies ordinary input and clearing and restores URL changes", () => {
    const onSearch = vi.fn();
    const page = render(<CatalogSearchInput value="한글" onSearch={onSearch} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "QWER" } });
    expect(onSearch).toHaveBeenLastCalledWith("QWER");
    fireEvent.change(input, { target: { value: "" } });
    expect(onSearch).toHaveBeenLastCalledWith("");
    page.rerender(<CatalogSearchInput value="복원" onSearch={onSearch} />);
    expect(input.value).toBe("복원");
  });
});
