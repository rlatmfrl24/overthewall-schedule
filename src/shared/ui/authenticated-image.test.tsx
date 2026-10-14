// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { AuthenticatedImage } from "./authenticated-image";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("rechecks the same external URL when its owning notice context changes and never falls back after rejection", async () => {
  vi.stubGlobal("window", Object.assign(window, { Clerk: { session: { getToken: async () => "session" } } }));
  const raw = "https://external.example/notice.webp";
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    expect(String(input).startsWith("/api/assets/protected-reference?")).toBe(true);
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer session");
    const context = JSON.parse(new URL(String(input), window.location.origin).searchParams.get("context")!);
    return context.relatedMemberUids.length ? new Response("Unresolved", { status: 400 }) : Response.json({ path: null });
  });
  vi.stubGlobal("fetch", fetcher);
  const view = render(<AuthenticatedImage src={raw} alt="draft" referenceContext={{ kind: "notice-draft", relatedMemberUids: [] }} />);
  await waitFor(() => expect(view.getByAltText("draft").getAttribute("src")).toBe(raw));
  view.rerender(<AuthenticatedImage src={raw} alt="draft" referenceContext={{ kind: "notice-draft", relatedMemberUids: [1] }} />);
  expect(view.getByAltText("draft").getAttribute("src")).toBeNull();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(view.getByAltText("draft").getAttribute("src")).toBeNull();
});
it("rejects relative authority tricks and an unclassified absolute origin without issuing a remote bearer request",async()=>{
  vi.stubGlobal("window",Object.assign(window,{Clerk:{session:{getToken:async()=>"session"}}}));
  const fetcher=vi.fn<typeof fetch>(async(input)=>{expect(String(input).startsWith("/api/assets/protected-reference?")).toBe(true);return new Response("Unresolved asset reference",{status:400});});
  vi.stubGlobal("fetch",fetcher);
  const view=render(<><AuthenticatedImage src="/\\foreign.example/profile/a.webp" alt="authority trick"/><AuthenticatedImage src="https://unknown.example/profile/a.webp" alt="unknown origin"/></>);
  await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));
  expect(view.getByAltText("authority trick").getAttribute("src")).toBeNull();
  expect(view.getByAltText("unknown origin").getAttribute("src")).toBeNull();
});
it("resolves stored own absolute references on the same site and never sends bearer to external image origins",async()=>{
  vi.stubGlobal("window",Object.assign(window,{Clerk:{session:{getToken:async()=>"session"}}}));
  URL.createObjectURL=()=>"blob:own-absolute";URL.revokeObjectURL=()=>{};
  const own=" https://otw-schedule.info/profile/bing_hayu.webp ",external="https://external.example/profile/bing_hayu.webp";
  const fetcher=vi.fn<typeof fetch>(async(input,init)=>{
    const path=String(input);
    expect(path.startsWith("/")).toBe(true);
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer session");
    if(path.startsWith("/api/assets/protected-reference?")) return Response.json({path:path.includes(encodeURIComponent(own))?"/profile/bing_hayu.webp":null});
    expect(path).toBe("/profile/bing_hayu.webp?archive=1");
    return new Response(new Uint8Array([1,2,3]));
  });
  vi.stubGlobal("fetch",fetcher);
  const view=render(<><AuthenticatedImage src={own} alt="own absolute"/><AuthenticatedImage src={external} alt="external"/></>);
  expect(view.getByAltText("own absolute").getAttribute("src")).toBeNull();
  await waitFor(()=>expect(view.getByAltText("own absolute").getAttribute("src")).toBe("blob:own-absolute"));
  await waitFor(()=>expect(view.getByAltText("external").getAttribute("src")).toBe(external));
  expect(fetcher.mock.calls).toHaveLength(3);
  expect(fetcher.mock.calls.every(([url])=>String(url).startsWith("/"))).toBe(true);
});
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
