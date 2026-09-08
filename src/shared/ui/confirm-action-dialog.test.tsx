// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConfirmActionDialog } from "./confirm-action-dialog";

afterEach(cleanup);

it("returns focus to a standalone confirmation's invoking button after Escape", async () => {
  const execute = vi.fn();
  function Example() {
    const [open, setOpen] = useState(false);
    return <>
      <button onClick={() => setOpen(true)}>선택 항목 삭제</button>
      <ConfirmActionDialog open={open} onOpenChange={setOpen} title="삭제 확인"
        description="선택한 항목을 삭제합니다." onConfirm={execute} />
    </>;
  }
  render(<Example />);
  const trigger = screen.getByRole("button", { name: "선택 항목 삭제" });
  trigger.focus();
  fireEvent.click(trigger);
  const cancel = await screen.findByRole("button", { name: "취소" });
  await waitFor(() => expect(document.activeElement).toBe(cancel));
  fireEvent.keyDown(cancel, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(trigger));
  expect(execute).not.toHaveBeenCalled();
});
