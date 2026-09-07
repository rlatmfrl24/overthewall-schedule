import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";

export function useButtonFeedback() {
  const animations = useRef(new Set<Animation>());
  const iconAnimations = useRef(new WeakMap<SVGSVGElement, Animation>());
  useEffect(() => {
    const active = animations.current;
    return () => {
      active.forEach((animation) => animation.cancel());
      active.clear();
    };
  }, []);

  const animateIcon = (target: EventTarget, root: HTMLElement) => {
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLElement>("button, a[data-slot=button], .play-tabs a");
    if (!button || !root.contains(button) || button.matches(":disabled, [aria-disabled=true]")) return;
    const icon = button.querySelector<SVGSVGElement>("svg");
    if (!icon || typeof icon.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const movement = icon.matches(".lucide-arrow-right, .lucide-skip-forward, .lucide-step-forward")
      ? "translateX(3px)"
      : icon.matches(".lucide-arrow-left, .lucide-skip-back")
        ? "translateX(-3px)"
        : icon.matches(".lucide-repeat, .lucide-repeat-1, .lucide-shuffle")
          ? "rotate(20deg)"
          : "scale(1.18)";
    iconAnimations.current.get(icon)?.cancel();
    const animation = icon.animate([
      { transform: "none" },
      { transform: movement, offset: 0.4 },
      { transform: "none" },
    ], { duration: 360, easing: "cubic-bezier(0.2, 0, 0.2, 1)" });
    iconAnimations.current.set(icon, animation);
    animations.current.add(animation);
    void animation.finished.then(
      () => animations.current.delete(animation),
      () => animations.current.delete(animation),
    );
  };

  return {
    onPointerDownCapture: (event: PointerEvent<HTMLDivElement>) => {
      if (event.button === 0) animateIcon(event.target, event.currentTarget);
    },
    onPointerOverCapture: (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "touch" || !(event.target instanceof Element)) return;
      const button = event.target.closest("button, a[data-slot=button]");
      if (event.relatedTarget instanceof Node && button?.contains(event.relatedTarget)) return;
      animateIcon(event.target, event.currentTarget);
    },
    onKeyDownCapture: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
      if (event.key === " " && event.target instanceof Element && event.target.closest("a")) return;
      animateIcon(event.target, event.currentTarget);
    },
  };
}
