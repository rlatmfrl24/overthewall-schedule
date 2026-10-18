// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { AuthenticatedImage } from "./authenticated-image";
import { ContentSessionContext } from "@/shared/hooks/content-session";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("uses the own login for normal workspace images without requesting admin archive access",async()=>{
  vi.stubGlobal("window",Object.assign(window,{Clerk:{session:{getToken:async()=>"own-user-session"}}}));
  let counter=0;URL.createObjectURL=()=>`blob:workspace-${++counter}`;const revoke=vi.fn();URL.revokeObjectURL=revoke;
  const fetcher=vi.fn<typeof fetch>(async(input,init)=>{
    expect(String(input)).toBe("/profile/bing_hayu.webp");expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer own-user-session");expect(init?.cache).toBe("no-store");
    return new Response(new Uint8Array([1]));
  });vi.stubGlobal("fetch",fetcher);
  const images=<><AuthenticatedImage protectedImage={false} src="/profile/bing_hayu.webp" srcSet="/profile/bing_hayu.webp 2x" alt="workspace"/><AuthenticatedImage protectedImage={false} src="https://external.example/image.webp" alt="external"/></>;
  const view=render(<ContentSessionContext.Provider value="own-session">{images}</ContentSessionContext.Provider>);
  expect(view.getByAltText("workspace").getAttribute("src")).toBeNull();expect(view.getByAltText("workspace").getAttribute("srcset")).toBeNull();
  await waitFor(()=>expect(view.getByAltText("workspace").getAttribute("src")).toBe("blob:workspace-1"));
  expect(view.getByAltText("external").getAttribute("src")).toBe("https://external.example/image.webp");expect(fetcher).toHaveBeenCalledOnce();
  view.rerender(<ContentSessionContext.Provider value="other-session">{images}</ContentSessionContext.Provider>);
  expect(view.getByAltText("workspace").getAttribute("src")).toBeNull();expect(revoke).toHaveBeenCalledWith("blob:workspace-1");
  await waitFor(()=>expect(view.getByAltText("workspace").getAttribute("src")).toBe("blob:workspace-2"));
});
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

it("shares identical private image bytes until the last mounted consumer leaves", async () => {
  vi.stubGlobal("window", Object.assign(window, { Clerk: { session: { getToken: async () => "own-session" } } }));
  let finish: ((response: Response) => void) | undefined;
  let signal: AbortSignal | null | undefined;
  const fetcher = vi.fn<typeof fetch>(async (_path, init) => {
    signal = init?.signal;
    return new Promise<Response>(resolve => { finish = resolve; });
  });
  vi.stubGlobal("fetch", fetcher);
  const create = vi.fn(() => "blob:shared-profile");
  const revoke = vi.fn(); URL.createObjectURL = create; URL.revokeObjectURL = revoke;
  const image = (key: string) => <AuthenticatedImage key={key} protectedImage={false} src="/profile/signatures/bing_hayu.png" alt={key} />;
  const view = render(<ContentSessionContext.Provider value="same-session">{image("first")}{image("second")}</ContentSessionContext.Provider>);
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  view.rerender(<ContentSessionContext.Provider value="same-session">{image("second")}</ContentSessionContext.Provider>);
  expect(signal?.aborted).toBe(false);
  await act(async () => finish!(new Response(new Uint8Array([1, 2, 3]))));
  await waitFor(() => expect(view.getByAltText("second").getAttribute("src")).toBe("blob:shared-profile"));
  expect(create).toHaveBeenCalledOnce();expect(revoke).not.toHaveBeenCalled();
  view.unmount();expect(revoke).toHaveBeenCalledOnce();expect(signal?.aborted).toBe(true);
});

it("never shares protected image bytes between content sessions", async () => {
  vi.stubGlobal("window", Object.assign(window, { Clerk: { session: { getToken: async () => "token" } } }));
  const fetcher = vi.fn<typeof fetch>(async () => new Response(new Uint8Array([1])));
  vi.stubGlobal("fetch", fetcher);
  let count=0;URL.createObjectURL=()=>`blob:isolated-${++count}`;URL.revokeObjectURL=()=>{};
  const view=render(<>
    <ContentSessionContext.Provider value="session-a"><AuthenticatedImage protectedImage={false} src="/profile/bing_hayu.webp" alt="a" /></ContentSessionContext.Provider>
    <ContentSessionContext.Provider value="session-b"><AuthenticatedImage protectedImage={false} src="/profile/bing_hayu.webp" alt="b" /></ContentSessionContext.Provider>
  </>);
  await waitFor(()=>expect(view.getByAltText("a").getAttribute("src")).toBeTruthy());
  await waitFor(()=>expect(view.getByAltText("b").getAttribute("src")).toBeTruthy());
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(view.getByAltText("a").getAttribute("src")).not.toBe(view.getByAltText("b").getAttribute("src"));
});

it("keeps simultaneous reference permissions isolated within one session", async () => {
  vi.stubGlobal("window", Object.assign(window, { Clerk: { session: { getToken: async () => "token" } } }));
  const raw = "https://external.example/image.webp";
  const fetcher = vi.fn<typeof fetch>(async input => {
    const context = JSON.parse(new URL(String(input), window.location.origin).searchParams.get("context")!);
    return context.relatedMemberUids.length ? new Response("Unresolved", { status: 400 }) : Response.json({ path: null });
  });
  vi.stubGlobal("fetch", fetcher);
  const view = render(<ContentSessionContext.Provider value="session">
    <AuthenticatedImage src={raw} alt="allowed" referenceContext={{ kind: "notice-draft", relatedMemberUids: [] }} />
    <AuthenticatedImage src={raw} alt="denied" referenceContext={{ kind: "notice-draft", relatedMemberUids: [1] }} />
  </ContentSessionContext.Provider>);
  await waitFor(() => expect(view.getByAltText("allowed").getAttribute("src")).toBe(raw));
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(view.getByAltText("denied").getAttribute("src")).toBeNull();
});

it("retries failed bytes for a new consumer without an old consumer releasing its request", async () => {
  vi.stubGlobal("window", Object.assign(window, { Clerk: { session: { getToken: async () => "token" } } }));
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("Failed", { status: 500 })).mockResolvedValueOnce(new Response(new Uint8Array([1])));
  vi.stubGlobal("fetch", fetcher);
  URL.createObjectURL = () => "blob:retry"; const revoke = vi.fn(); URL.revokeObjectURL = revoke;
  const image = (key: string) => <AuthenticatedImage key={key} protectedImage={false} src="/profile/bing_hayu.webp" alt={key} />;
  const view = render(<ContentSessionContext.Provider value="session">{image("failed")}</ContentSessionContext.Provider>);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(view.getByAltText("failed").getAttribute("src")).toBeNull();
  view.rerender(<ContentSessionContext.Provider value="session">{image("failed")}{image("retry")}</ContentSessionContext.Provider>);
  await waitFor(() => expect(view.getByAltText("retry").getAttribute("src")).toBe("blob:retry"));
  view.rerender(<ContentSessionContext.Provider value="session">{image("retry")}</ContentSessionContext.Provider>);
  expect(revoke).not.toHaveBeenCalled();expect(fetcher).toHaveBeenCalledTimes(2);
  view.unmount();expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:retry");
});

it("does not create private object URLs when the last consumer leaves before bytes arrive", async () => {
  vi.stubGlobal("window", Object.assign(window, { Clerk: { session: { getToken: async () => "token" } } }));
  let finish: ((response: Response) => void) | undefined;
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Promise<Response>(resolve => { finish = resolve; })));
  const create = vi.fn();URL.createObjectURL = create;const revoke = vi.fn();URL.revokeObjectURL = revoke;
  const view = render(<ContentSessionContext.Provider value="session"><AuthenticatedImage protectedImage={false} src="/profile/bing_hayu.webp" alt="cancelled" /></ContentSessionContext.Provider>);
  await waitFor(() => expect(finish).toBeDefined());view.unmount();
  await act(async () => finish!(new Response(new Uint8Array([1]))));
  expect(create).not.toHaveBeenCalled();expect(revoke).not.toHaveBeenCalled();
});

it("keeps the portrait placeholder until bytes load, resets for a new source, and leaves a stable fallback on error", () => {
  const view = render(<AuthenticatedImage protectedImage={false} showPlaceholder src="/profile/first.webp" alt="첫 멤버" className="size-12 rounded-full" />);
  const frame = () => view.container.firstElementChild!;
  expect(frame().getAttribute("aria-busy")).toBe("true");
  expect(view.getByAltText("첫 멤버").getAttribute("src")).toBe("/profile/first.webp");
  expect(view.getByAltText("첫 멤버").getAttribute("aria-hidden")).toBe("true");
  fireEvent.load(view.getByAltText("첫 멤버"));
  expect(frame().getAttribute("aria-busy")).toBe("false");
  expect(view.getByAltText("첫 멤버").getAttribute("aria-hidden")).toBeNull();
  expect(view.container.querySelector('[data-slot="skeleton"]')).toBeNull();

  view.rerender(<AuthenticatedImage protectedImage={false} showPlaceholder src="/profile/next.webp" alt="다음 멤버" className="size-12 rounded-full" />);
  expect(frame().getAttribute("aria-busy")).toBe("true");
  fireEvent.error(view.getByAltText("다음 멤버"));
  expect(frame().getAttribute("aria-busy")).toBe("false");
  expect(view.getByRole("img", { name: "다음 멤버 이미지를 불러올 수 없습니다" })).toBeTruthy();
  expect(view.getByAltText("다음 멤버").getAttribute("aria-hidden")).toBe("true");
});

it("recognizes a cached portrait without waiting for a second load event", () => {
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(96);
  const view = render(<AuthenticatedImage protectedImage={false} showPlaceholder src="/profile/cached.webp" alt="캐시된 멤버" />);
  expect(view.container.firstElementChild!.getAttribute("aria-busy")).toBe("false");
  expect(view.container.querySelector('[data-slot="skeleton"]')).toBeNull();
});

it("keeps the requested crop on the image and handles an already failed cached image without a broken-image flash", () => {
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(0);
  const view = render(<AuthenticatedImage protectedImage={false} showPlaceholder src="/profile/missing.webp" alt="사진" className="size-full object-[50%_18%]" style={{ objectFit: "contain", objectPosition: "25% 75%" }} />);
  const frame = view.container.firstElementChild as HTMLElement;
  const image = view.getByAltText("사진") as HTMLImageElement;
  expect(frame.style.objectFit).toBe("contain");
  expect(frame.style.objectPosition).toBe("25% 75%");
  expect(image.style.objectFit).toBe("inherit");
  expect(image.style.objectPosition).toBe("inherit");
  expect(frame.getAttribute("aria-busy")).toBe("false");
  expect(view.getByRole("img", { name: "사진 이미지를 불러올 수 없습니다" })).toBeTruthy();
  expect(image.getAttribute("aria-hidden")).toBe("true");
});

it("shows a stable fallback after authenticated bytes fail and never displays a previous session portrait", async () => {
  vi.stubGlobal("window", Object.assign(window, { Clerk: { session: { getToken: async () => "token" } } }));
  let finish: ((response: Response) => void) | undefined;
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Promise<Response>(resolve => { finish = resolve; })));
  URL.createObjectURL = () => "blob:portrait"; const revoke = vi.fn(); URL.revokeObjectURL = revoke;
  const image = <AuthenticatedImage protectedImage={false} showPlaceholder src="/profile/member.webp" alt="멤버" />;
  const view = render(<ContentSessionContext.Provider value="first">{image}</ContentSessionContext.Provider>);
  expect(view.getByAltText("멤버").getAttribute("src")).toBeNull();
  expect(view.container.firstElementChild!.getAttribute("aria-busy")).toBe("true");
  await waitFor(() => expect(finish).toBeDefined());
  await act(async () => finish!(new Response(new Uint8Array([1]))));
  fireEvent.load(view.getByAltText("멤버"));
  expect(view.container.firstElementChild!.getAttribute("aria-busy")).toBe("false");
  finish = undefined;
  view.rerender(<ContentSessionContext.Provider value="second">{image}</ContentSessionContext.Provider>);
  expect(view.getByAltText("멤버").getAttribute("src")).toBeNull();
  expect(view.container.firstElementChild!.getAttribute("aria-busy")).toBe("true");
  expect(revoke).toHaveBeenCalledWith("blob:portrait");
  await waitFor(() => expect(finish).toBeDefined());
  await act(async () => finish!(new Response("Forbidden", { status: 403 })));
  await waitFor(() => expect(view.container.firstElementChild!.getAttribute("aria-busy")).toBe("false"));
  expect(view.getByRole("img", { name: "멤버 이미지를 불러올 수 없습니다" })).toBeTruthy();
  expect(view.getByAltText("멤버").getAttribute("src")).toBeNull();
});
