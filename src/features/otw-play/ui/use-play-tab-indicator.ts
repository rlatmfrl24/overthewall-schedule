import { waapi } from "animejs/waapi";
import { useLayoutEffect, useRef } from "react";

import { useAnimations } from "@/shared/ui/animation-provider";

/** Follow the router's current link, including history and nested playlist routes. */
export function usePlayTabIndicator(visible: boolean) {
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const { enabled } = useAnimations();

  useLayoutEffect(() => {
    const indicator = indicatorRef.current;
    const nav = indicator?.parentElement;
    if (!indicator || !nav) return;
    let active: HTMLElement | null = null;
    let animation: ReturnType<typeof waapi.animate> | undefined;

    const position = (allowMotion: boolean) => {
      const next = nav.querySelector<HTMLElement>('a[aria-current="page"]');
      const previous = active;
      active = next;
      if (!next) {
        animation?.cancel();
        indicator.hidden = true;
        delete nav.dataset.indicator;
        return;
      }
      const current = getComputedStyle(indicator);
      const fromTransform = current.transform;
      const fromWidth = current.width;
      animation?.cancel();
      const transform = `translate(${next.offsetLeft}px, ${next.offsetTop}px)`;
      const width = `${next.offsetWidth}px`;
      Object.assign(indicator.style, { transform, width, height: `${next.offsetHeight}px` });
      indicator.hidden = false;
      nav.dataset.indicator = "ready";
      if (enabled && allowMotion && previous && previous !== next && typeof indicator.animate === "function") {
        animation = waapi.animate(indicator, {
          transform: [fromTransform, transform], width: [fromWidth, width],
          duration: 200, ease: "cubic-bezier(0.16, 1, 0.3, 1)",
        });
      }
    };

    position(false);
    // Resize snaps into place; only navigation moves the highlight.
    const resize = new ResizeObserver(() => position(false));
    resize.observe(nav);
    nav.querySelectorAll("a").forEach(link => resize.observe(link));
    const selection = new MutationObserver(() => position(true));
    selection.observe(nav, { subtree: true, attributes: true, attributeFilter: ["aria-current"], childList: true });
    return () => {
      resize.disconnect();
      selection.disconnect();
      animation?.cancel();
      delete nav.dataset.indicator;
    };
  }, [enabled, visible]);

  return indicatorRef;
}
