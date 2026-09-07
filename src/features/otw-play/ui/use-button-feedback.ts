import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";

export function useButtonFeedback() {
  const animations = useRef(new Set<Animation>());
  useEffect(() => {
    const active = animations.current;
    return () => {
      active.forEach((animation) => animation.cancel());
      active.clear();
    };
  }, []);

  const ripple = (target: EventTarget, root: HTMLElement, point?: { x: number; y: number }) => {
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLElement>("button, a[data-slot=button], .play-tabs a");
    if (!button || !root.contains(button) || button.matches(":disabled, [aria-disabled=true]")) return;
    if (typeof button.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const rect = button.getBoundingClientRect();
    const x = point ? Math.max(0, Math.min(rect.width, point.x - rect.left)) : rect.width / 2;
    const y = point ? Math.max(0, Math.min(rect.height, point.y - rect.top)) : rect.height / 2;
    const diameter = 2 * Math.hypot(Math.max(x, rect.width - x), Math.max(y, rect.height - y));
    button.style.setProperty("--play-ripple-x", `${x}px`);
    button.style.setProperty("--play-ripple-y", `${y}px`);
    button.style.setProperty("--play-ripple-size", `${diameter}px`);
    const animation = button.animate([
      { transform: "translate(-50%, -50%) scale(0)", opacity: 0.2 },
      { transform: "translate(-50%, -50%) scale(1)", opacity: 0.16, offset: 0.65 },
      { transform: "translate(-50%, -50%) scale(1)", opacity: 0 },
    ], { pseudoElement: "::before", duration: 520, easing: "cubic-bezier(0.2, 0, 0, 1)" });
    animations.current.add(animation);
    void animation.finished.then(
      () => animations.current.delete(animation),
      () => animations.current.delete(animation),
    );
  };

  return {
    onPointerDownCapture: (event: PointerEvent<HTMLDivElement>) => {
      if (event.button === 0) ripple(event.target, event.currentTarget, { x: event.clientX, y: event.clientY });
    },
    onKeyDownCapture: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
      if (event.key === " " && event.target instanceof Element && event.target.closest("a")) return;
      ripple(event.target, event.currentTarget);
    },
  };
}
