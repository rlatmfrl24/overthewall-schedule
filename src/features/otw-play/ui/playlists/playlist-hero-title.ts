import { waapi } from "animejs/waapi";

const findTitle = (artwork: HTMLElement) => artwork.closest(".playlist-card-main, .playlist-detail-heading")
  ?.querySelector<HTMLElement>("[data-playlist-hero-title]");

function copyTitle(title: HTMLElement, layer: HTMLElement, viewport: DOMRect) {
  const rect = title.getBoundingClientRect();
  const style = getComputedStyle(title);
  const copy = document.createElement("div");
  copy.className = "playlist-hero-title";
  copy.textContent = title.textContent;
  copy.setAttribute("aria-hidden", "true");
  Object.assign(copy.style, {
    left: `${rect.left - viewport.left}px`, top: `${rect.top - viewport.top}px`, width: `${rect.width}px`,
    fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight,
    fontStyle: style.fontStyle, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing,
    color: style.color, textAlign: style.textAlign, textTransform: style.textTransform,
    textWrap: style.textWrap, wordBreak: style.wordBreak, overflowWrap: style.overflowWrap,
  });
  layer.append(copy);
  return { copy, rect, fontSize: Number.parseFloat(style.fontSize) || 16 };
}

/** Keep each endpoint's line breaks intact and crossfade uniform text scales. */
export function createPlaylistHeroTitle(sourceArtwork: HTMLElement, layer: HTMLElement, viewport: DOMRect) {
  const source = findTitle(sourceArtwork);
  if (!source) return;
  const origin = copyTitle(source, layer, viewport);
  const sourceOpacity = source.style.opacity;
  source.style.opacity = "0";
  let destination: HTMLElement | undefined;
  let destinationOpacity = "";
  let targetCopy: HTMLElement | undefined;
  const animations: ReturnType<typeof waapi.animate>[] = [];
  return {
    arrive(artwork: HTMLElement, timing: { duration: number; ease: string }) {
      const title = findTitle(artwork);
      if (!title) { origin.copy.remove(); return; }
      destination = title;
      destinationOpacity = title.style.opacity;
      const target = copyTitle(title, layer, viewport);
      targetCopy = target.copy;
      target.copy.style.opacity = "0";
      title.style.opacity = "0";
      const dx = target.rect.left - origin.rect.left;
      const dy = target.rect.top - origin.rect.top;
      animations.push(waapi.animate(origin.copy, {
        transform: [`translate(0px, 0px) scale(1)`, `translate(${dx}px, ${dy}px) scale(${target.fontSize / origin.fontSize})`],
        opacity: [1, 0], ...timing,
      }));
      animations.push(waapi.animate(target.copy, {
        transform: [`translate(${-dx}px, ${-dy}px) scale(${origin.fontSize / target.fontSize})`, "translate(0px, 0px) scale(1)"],
        opacity: [0, 1], ...timing,
      }));
    },
    dispose() {
      animations.forEach(animation => animation.cancel());
      source.style.opacity = sourceOpacity;
      if (destination) destination.style.opacity = destinationOpacity;
      origin.copy.remove();
      targetCopy?.remove();
    },
  };
}
