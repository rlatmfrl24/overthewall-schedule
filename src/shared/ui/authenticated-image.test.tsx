// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { AuthenticatedImage } from "./authenticated-image";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("keeps protected originals out of img requests and revokes Blob URLs on replacement and unmount", async () => {
  vi.stubGlobal("window", Object.assign(window, { Clerk: { session: { getToken: async () => "session" } } }));
  let finish: ((response: Response) => void) | undefined;
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (_path, init) => {
    if (new Headers(init?.headers).get("Authorization") !== "Bearer session") return new Response(null, { status: 401 });
    return new Promise<Response>(resolve => { finish = resolve; });
  }));
  const created: Blob[] = [];
  const revoked: string[] = [];
  URL.createObjectURL = blob => { if(!(blob instanceof Blob)) throw new Error("Expected Blob"); created.push(blob); return `blob:protected-${created.length}`; };
  URL.revokeObjectURL = url => { revoked.push(url); };
  const view = render(<AuthenticatedImage src="/profile/bing_hayu.webp" srcSet="/profile/bing_hayu.webp 2x" alt="보관 이미지" />);
  expect(view.getByAltText("보관 이미지").getAttribute("src")).toBeNull();
  expect(view.getByAltText("보관 이미지").getAttribute("srcset")).toBeNull();
  await waitFor(() => expect(finish).toBeDefined());
  await act(async () => finish!(new Response(new Uint8Array([1, 2, 255]), { headers: { "Content-Type": "image/webp" } })));
  expect(view.getByAltText("보관 이미지").getAttribute("src")).toBe("blob:protected-1");
  expect([...new Uint8Array(await created[0].arrayBuffer())]).toEqual([1, 2, 255]);
  finish = undefined;
  view.rerender(<AuthenticatedImage src="/profile/u_lili.webp" alt="보관 이미지" />);
  expect(view.getByAltText("보관 이미지").getAttribute("src")).toBeNull();
  expect(revoked).toEqual(["blob:protected-1"]);
  await waitFor(() => expect(finish).toBeDefined());
  await act(async () => finish!(new Response("next", { headers: { "Content-Type": "image/webp" } })));
  await waitFor(() => expect(view.getByAltText("보관 이미지").getAttribute("src")).toBe("blob:protected-2"));
  view.unmount();
  expect(revoked).toEqual(["blob:protected-1", "blob:protected-2"]);
});
