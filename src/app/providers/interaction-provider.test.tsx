// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Link, Outlet, RouterProvider } from "@tanstack/react-router";
import { InteractionProvider } from "./interaction-provider";
import { useUnsavedChanges } from "@/shared/lib/unsaved-changes";
import { useConfirmation } from "@/shared/lib/confirmation";

afterEach(cleanup);

function renderApp(Page: () => React.JSX.Element) {
  const root = createRootRoute({ component: () => <InteractionProvider><Outlet /></InteractionProvider> });
  const home = createRoute({ getParentRoute: () => root, path: "/", component: Page });
  const next = createRoute({ getParentRoute: () => root, path: "/weekly", component: () => <h1>주간 화면</h1> });
  const router = createRouter({ routeTree: root.addChildren([home, next]), history: createMemoryHistory({ initialEntries: ["/"] }) });
  render(<RouterProvider router={router} />);
  return router;
}

it("실제 라우터에서 미저장 이동을 취소하면 입력을 보존하고 확인 후에만 이동한다", async () => {
  function Editor() {
    const [text, setText] = useState("");
    useUnsavedChanges(Boolean(text));
    return <><input aria-label="제목" value={text} onChange={(event) => setText(event.target.value)} /><Link to="/weekly">주간으로</Link></>;
  }
  const router = renderApp(Editor);
  fireEvent.change(await screen.findByLabelText("제목"), { target: { value: "보존할 입력" } });
  const link = screen.getByRole("link", { name: "주간으로" });
  link.focus();
  fireEvent.click(link);
  await screen.findByRole("alertdialog");
  fireEvent.click(screen.getByRole("button", { name: "계속 편집" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect((screen.getByLabelText("제목") as HTMLInputElement).value).toBe("보존할 입력");
  expect(router.state.location.pathname).toBe("/");
  await waitFor(() => expect(document.activeElement).toBe(link));
  fireEvent.click(link);
  fireEvent.click(await screen.findByRole("button", { name: "변경 버리고 이동" }));
  await screen.findByRole("heading", { name: "주간 화면" });
});

it("중복 확인 요청은 한 번만 실행하며 Escape 취소는 작업을 실행하지 않는다", async () => {
  const execute = vi.fn();
  function Actions() {
    const confirm = useConfirmation();
    const request = async () => { if (await confirm({ title: "작업 확인", description: "선택한 작업을 실행합니다." })) execute(); };
    return <button onClick={() => { void request(); void request(); }}>작업</button>;
  }
  renderApp(Actions);
  fireEvent.click(await screen.findByRole("button", { name: "작업" }));
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.keyDown(dialog, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(execute).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "작업" }));
  fireEvent.click(await screen.findByRole("button", { name: "확인" }));
  await waitFor(() => expect(execute).toHaveBeenCalledOnce());
});
