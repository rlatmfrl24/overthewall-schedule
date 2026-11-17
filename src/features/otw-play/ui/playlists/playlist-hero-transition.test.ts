// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPlaylistHeroTransition } from "./playlist-hero-transition";

const { animate, revert } = vi.hoisted(() => {
  const cancel = vi.fn();
  const revert = vi.fn();
  return { animate: vi.fn<(target: Element, options: Record<string, unknown>) => { cancel: () => void; revert: () => void }>(() => ({ cancel, revert })), revert };
});
vi.mock("animejs/waapi", () => ({ waapi: { animate } }));
const detail = "/play/playlists/defaults/cover";
let root: HTMLDivElement;
let controller: ReturnType<typeof createPlaylistHeroTransition>;
const rect = (x: number, y: number, width: number, height: number) => ({ x, y, left: x, top: y, right: x + width, bottom: y + height, width, height, toJSON: () => ({}) });

function artwork(kind: "card" | "detail", key = detail) {
  const node = document.createElement("div");
  node.dataset.playlistHero = key;
  node.dataset.heroKind = kind;
  node.innerHTML = '<img src="/cover.jpg" alt="" />';
  node.getBoundingClientRect = () => kind === "card" ? rect(100, 200, 320, 320) : rect(20, 80, 208, 208);
  const wrapper = document.createElement(kind === "card" ? "a" : "header");
  wrapper.className = kind === "card" ? "playlist-card-main" : "playlist-detail-heading";
  if (wrapper instanceof HTMLAnchorElement) wrapper.href = key;
  const title = document.createElement(kind === "card" ? "h3" : "h1");
  title.textContent = "함께 듣는 긴 플레이리스트 제목";
  wrapper.append(node, title);
  const strip = document.createElement("div");
  strip.className = "playlist-discovery-grid";
  strip.append(wrapper);
  root.replaceChildren(strip);
  return node;
}
async function commit() {
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(20);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => setTimeout(callback, 16));
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  root = document.createElement("div");
  root.getBoundingClientRect = () => rect(0, 64, 1000, 800);
  document.body.append(root);
  controller = createPlaylistHeroTransition(root, true);
});

afterEach(() => {
  controller.dispose();
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

it("reveals the destination without flying or duplicating artwork and titles, and restores both scroll axes", async () => {
  const source = artwork("card");
  root.scrollTop = 420;
  root.querySelector(".playlist-discovery-grid")!.scrollLeft = 180;
  controller.navigate("/play", detail);
  expect(source.style.visibility).toBe("");
  expect(root.querySelector("h3")!.style.opacity).toBe("");
  expect(document.querySelector(".playlist-hero-layer")).toBeNull();
  root.replaceChildren(document.createElement("p"));
  await commit();
  expect(animate).not.toHaveBeenCalled();
  const target = artwork("detail");
  await commit();
  expect(root.scrollTop).toBe(0);
  expect(target.style.visibility).toBe("");
  expect(animate).toHaveBeenCalledWith(target.parentElement, expect.objectContaining({
    transform: ["translateY(4px)", "translateY(0px)"], opacity: [0.72, 1],
    duration: 180, ease: "cubic-bezier(0.23, 1, 0.32, 1)",
  }));
  controller.navigate(detail, "/play");
  const card = artwork("card");
  await commit();
  expect(root.scrollTop).toBe(420);
  expect(root.querySelector(".playlist-discovery-grid")!.scrollLeft).toBe(180);
  expect(document.activeElement).toBe(card.parentElement);
  expect(animate).toHaveBeenLastCalledWith(card.parentElement, expect.objectContaining({
    transform: ["translateY(2px)", "translateY(0px)"], opacity: [0.72, 1], duration: 140,
  }));
});

it.each(["disabled", "keyboard", "unsupported"])("keeps navigation, focus and scroll restoration with %s motion", async mode => {
  controller.dispose();
  controller = createPlaylistHeroTransition(root, mode !== "disabled");
  if (mode === "keyboard") root.dataset.playInput = "keyboard";
  if (mode === "unsupported") Reflect.deleteProperty(HTMLElement.prototype, "animate");
  artwork("card");
  root.scrollTop = 300;
  controller.navigate("/play/playlists", detail);
  artwork("detail");
  await commit();
  expect(root.scrollTop).toBe(0);
  controller.navigate(detail, "/play/playlists");
  const card = artwork("card");
  await commit();
  expect(root.scrollTop).toBe(300);
  expect(document.activeElement).toBe(card.parentElement);
  expect(animate).not.toHaveBeenCalled();
});

it.each(["resize", "wheel", "touchmove", "navigation", "unmount"])("cancels an active reveal on %s without leaving hidden content", async reason => {
  artwork("card");
  controller.navigate("/play/playlists", detail);
  const target = artwork("detail");
  await commit();
  expect(animate).toHaveBeenCalledTimes(1);
  if (reason === "resize") window.dispatchEvent(new Event("resize"));
  if (reason === "wheel" || reason === "touchmove") root.dispatchEvent(new Event(reason));
  if (reason === "navigation") controller.navigate(detail, "/play/songs");
  if (reason === "unmount") controller.dispose();
  expect(revert).toHaveBeenCalledTimes(1);
  expect(target.style.visibility).toBe("");
  expect(root.querySelector("h1")!.style.opacity).toBe("");
});

it.each(["completion", "wheel"])("restores the destination's original inline styles on %s", async reason => {
  artwork("card");
  controller.navigate("/play/playlists", detail);
  const content = artwork("detail").parentElement!;
  content.style.opacity = "0.95";
  content.style.transform = "translateX(1px)";
  animate.mockImplementationOnce(() => ({
    // Anime.js cancel commits the current frame; revert restores the original styles.
    cancel: () => { content.style.opacity = "0.84"; content.style.transform = "translateY(2px)"; },
    revert: () => { content.style.opacity = "0.95"; content.style.transform = "translateX(1px)"; },
  }));
  await commit();
  if (reason === "completion") (animate.mock.calls.at(-1)![1].onComplete as () => void)();
  else root.dispatchEvent(new Event("wheel"));
  expect(content.style.opacity).toBe("0.95");
  expect(content.style.transform).toBe("translateX(1px)");
});

it("stops observing a delayed destination after timeout", async () => {
  artwork("card");
  controller.navigate("/play/playlists", detail);
  await vi.advanceTimersByTimeAsync(1200);
  artwork("detail");
  await commit();
  expect(animate).not.toHaveBeenCalled();
});

it("does not animate editor routes or another playlist", async () => {
  artwork("card");
  controller.navigate("/play/playlists", "/play/playlists/new");
  controller.navigate("/play/playlists", "/play/playlists/another");
  artwork("detail");
  await commit();
  expect(animate).not.toHaveBeenCalled();
});

it("supports personal playlists and placeholders without depending on a loaded image", async () => {
  const key = "/play/playlists/my-playlist";
  artwork("card", key).replaceChildren();
  controller.navigate("/play/playlists", key);
  const target = artwork("detail", key);
  target.replaceChildren();
  await commit();
  expect(animate).toHaveBeenCalledWith(target.parentElement, expect.objectContaining({ duration: 180 }));
});
