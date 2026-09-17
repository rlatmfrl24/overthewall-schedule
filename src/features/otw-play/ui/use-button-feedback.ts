import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { waapi } from "animejs/waapi";

import { useAnimations } from "@/shared/ui/animation-provider";

export function useButtonFeedback() {
  const { enabled } = useAnimations();
  const animations = useRef(new Set<ReturnType<typeof waapi.animate>>());
  const iconAnimations = useRef(new WeakMap<SVGSVGElement, ReturnType<typeof waapi.animate>>());
  useEffect(() => {
    const active = animations.current;
    return () => {
      active.forEach((animation) => animation.revert());
      active.clear();
    };
  }, [enabled]);

  const animateIcon = (target: EventTarget, root: HTMLElement) => {
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLElement>("button, a[data-slot=button], .play-tabs a");
    if (!button || !root.contains(button) || button.matches(":disabled, [aria-disabled=true]")) return;
    if (button.closest('[data-button-feedback="local"]')) return;
    const icon = button.querySelector<SVGSVGElement>("svg");
    if (!icon || typeof icon.animate !== "function" || !enabled) return;
    const movement = icon.matches(".lucide-arrow-right, .lucide-skip-forward, .lucide-step-forward")
      ? "translateX(3px)"
      : icon.matches(".lucide-arrow-left, .lucide-skip-back")
        ? "translateX(-3px)"
        : icon.matches(".lucide-repeat, .lucide-repeat-1, .lucide-shuffle")
          ? "rotate(20deg)"
          : "scale(1.12)";
    const previous = iconAnimations.current.get(icon);
    previous?.revert();
    if (previous) animations.current.delete(previous);
    const animation = waapi.animate(icon, {
      transform: ["none", movement, "none"],
      duration: 240,
      ease: "cubic-bezier(0.2, 0, 0.2, 1)",
      onComplete: (completed) => {
        completed.revert();
        animations.current.delete(completed);
        if (iconAnimations.current.get(icon) === completed) iconAnimations.current.delete(icon);
      },
    });
    iconAnimations.current.set(icon, animation);
    animations.current.add(animation);
  };

  return {
    onPointerDownCapture: (event: PointerEvent<HTMLDivElement>) => {
      event.currentTarget.dataset.playInput = "pointer";
      if (event.button === 0) animateIcon(event.target, event.currentTarget);
    },
    onPointerOverCapture: (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "touch" || !(event.target instanceof Element)) return;
      const button = event.target.closest("button, a[data-slot=button], .play-tabs a");
      if (event.relatedTarget instanceof Node && button?.contains(event.relatedTarget)) return;
      animateIcon(event.target, event.currentTarget);
    },
    onKeyDownCapture: (event: KeyboardEvent<HTMLDivElement>) => {
      event.currentTarget.dataset.playInput = "keyboard";
      if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
      if (event.key === " " && event.target instanceof Element && event.target.closest("a")) return;
      animateIcon(event.target, event.currentTarget);
    },
  };
}
