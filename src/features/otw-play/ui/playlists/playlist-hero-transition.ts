import { waapi } from "animejs/waapi";
import { createPlaylistHeroTitle } from "./playlist-hero-title";

const isCollection = (path: string) => path === "/play" || path === "/play/playlists";
const isDetail = (path: string) => /^\/play\/playlists\/(?:defaults\/[^/]+|(?!new$)[^/]+)$/.test(path);
export type PlaylistHeroScrollPositions = Map<string, { top: number; left: number }>;

/** One transient image bridges route commits, without keeping an old page or player alive. */
export function createPlaylistHeroTransition(root: HTMLElement, enabled: boolean, scrollPositions: PlaylistHeroScrollPositions = new Map()) {
  let disposeTransition = () => {};

  const navigate = (from: string, to: string) => {
    disposeTransition();
    const opening = isCollection(from) && isDetail(to);
    const closing = isDetail(from) && isCollection(to);
    if (!opening && !closing) return;
    const key = opening ? to : from;
    const findArtwork = (kind: string) => Array.from(root.querySelectorAll<HTMLElement>("[data-playlist-hero]"))
      .find(element => element.dataset.playlistHero === key && element.dataset.heroKind === kind);
    const source = findArtwork(opening ? "card" : "detail");
    const image = source?.querySelector("img");
    if (!source || !image) return;
    if (opening) scrollPositions.set(from, { top: root.scrollTop, left: root.querySelector(".playlist-discovery-grid")?.scrollLeft ?? 0 });

    const bounds = source.getBoundingClientRect();
    const viewport = root.getBoundingClientRect();
    const visible = bounds.width > 0 && bounds.height > 0 && bounds.bottom > viewport.top && bounds.top < viewport.bottom && bounds.right > viewport.left && bounds.left < viewport.right;
    const keyboard = root.closest<HTMLElement>("[data-play-input]")?.dataset.playInput === "keyboard";
    const overlay = enabled && !keyboard && visible && typeof source.animate === "function" ? document.createElement("div") : null;
    const layer = overlay ? document.createElement("div") : null;
    const animations: ReturnType<typeof waapi.animate>[] = [];
    let destination: HTMLElement | undefined;
    let title: ReturnType<typeof createPlaylistHeroTitle>;
    let stopped = false;
    const originalVisibility = source.style.visibility;
    let destinationVisibility = "";
    let frame = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(arrive);
    });

    const finish = () => {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      observer.disconnect();
      animations.forEach(animation => animation.cancel());
      title?.dispose();
      source.style.visibility = originalVisibility;
      if (destination) destination.style.visibility = destinationVisibility;
      layer?.remove();
      window.removeEventListener("resize", finish);
      root.removeEventListener("wheel", finish);
      root.removeEventListener("touchmove", finish);
    };
    disposeTransition = finish;

    let copy: HTMLImageElement | undefined;
    let shade: HTMLDivElement | undefined;
    if (overlay && layer) {
      layer.className = "playlist-hero-layer";
      layer.setAttribute("aria-hidden", "true");
      Object.assign(layer.style, { left: `${viewport.left}px`, top: `${viewport.top}px`, width: `${viewport.width}px`, height: `${viewport.height}px` });
      overlay.className = "playlist-hero-flight";
      overlay.setAttribute("aria-hidden", "true");
      overlay.dataset.direction = opening ? "open" : "close";
      Object.assign(overlay.style, {
        left: `${bounds.left - viewport.left}px`, top: `${bounds.top - viewport.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px`,
        borderRadius: opening ? "14px" : "12px",
      });
      const imageStyle = getComputedStyle(image);
      copy = document.createElement("img");
      copy.src = image.currentSrc || image.src;
      copy.alt = "";
      Object.assign(copy.style, { objectPosition: imageStyle.objectPosition, transform: imageStyle.transform });
      shade = document.createElement("div");
      shade.style.opacity = opening ? "0.55" : "0";
      overlay.append(copy, shade);
      layer.append(overlay);
      document.body.append(layer);
      title = createPlaylistHeroTitle(source, layer, viewport);
      source.style.visibility = "hidden";
    }

    function arrive() {
      if (stopped) return;
      const target = findArtwork(opening ? "detail" : "card");
      if (!target) return;
      observer.disconnect();
      clearTimeout(timer);
      const position = closing ? scrollPositions.get(to) : undefined;
      root.scrollTop = position?.top ?? 0;
      const strip = root.querySelector(".playlist-discovery-grid");
      if (strip && position) strip.scrollLeft = position.left;
      // A direct detail URL or a return to a different collection has no saved position.
      if (closing) target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
      if (closing && document.activeElement === document.body) target.closest("a")?.focus({ preventScroll: true });
      if (!overlay || !copy || !shade) { finish(); return; }
      destination = target;
      destinationVisibility = target.style.visibility;
      const targetBounds = target.getBoundingClientRect();
      const targetImage = target.querySelector("img");
      if (!targetImage || !targetBounds.width || !targetBounds.height) { finish(); return; }
      target.style.visibility = "hidden";
      const timing = { duration: 360, ease: "cubic-bezier(0.22, 1, 0.36, 1)" };
      title?.arrive(target, timing);
      const imageStyle = getComputedStyle(targetImage);
      animations.push(waapi.animate(copy, {
        objectPosition: [copy.style.objectPosition, imageStyle.objectPosition],
        transform: [copy.style.transform, imageStyle.transform], ...timing,
      }));
      animations.push(waapi.animate(shade, { opacity: closing ? 0.55 : 0, ...timing }));
      animations.push(waapi.animate(overlay, {
        translateX: targetBounds.left - bounds.left, translateY: targetBounds.top - bounds.top,
        width: targetBounds.width, height: targetBounds.height, borderRadius: closing ? 14 : 12,
        ...timing, onComplete: finish,
      }));
    }

    // Queries may resolve after the route commits; navigation never waits for the effect.
    observer.observe(root, { childList: true, subtree: true });
    const timer = setTimeout(finish, 1200);
    window.addEventListener("resize", finish);
    root.addEventListener("wheel", finish, { passive: true });
    root.addEventListener("touchmove", finish, { passive: true });
  };

  return { navigate, dispose: () => disposeTransition() };
}
