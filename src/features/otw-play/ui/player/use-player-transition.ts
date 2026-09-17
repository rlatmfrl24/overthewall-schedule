import { waapi } from "animejs/waapi";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { useAnimations } from "@/shared/ui/animation-provider";

type Presentation = { open: boolean; desktop: boolean; editing: boolean; hasQueue: boolean; trackId: string | null };
type Frame = { transform: string; opacity: string; clipPath: string };
const expandedClip = "inset(0px 0px 0px 0px round 0px)";
const ease = "cubic-bezier(0.77, 0, 0.175, 1)";
const entranceEase = "cubic-bezier(0.23, 1, 0.32, 1)";

/** Animate the existing player: never clone or remount its YouTube host. */
export function usePlayerTransition(sectionRef: RefObject<HTMLElement | null>, presentation: Presentation) {
  const launcherRef = useRef<HTMLDivElement>(null);
  const previous = useRef(presentation);
  const active = useRef<{ elements: HTMLElement[]; finish: () => void } | null>(null);
  const { enabled } = useAnimations();
  const { open, desktop, editing, hasQueue, trackId } = presentation;

  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = { open, desktop, editing, hasQueue, trackId };
    // Read the in-flight frame before reverting, so rapid reversals do not jump.
    const frames = new Map<HTMLElement, Frame>();
    active.current?.elements.forEach(element => {
      const style = getComputedStyle(element);
      frames.set(element, { transform: style.transform, opacity: style.opacity, clipPath: style.clipPath });
    });
    active.current?.finish();
    const section = sectionRef.current;
    const launcher = launcherRef.current;
    if (!section) return;
    section.hidden = !(desktop || open);
    if (!launcher) return;
    if (before.open === open || desktop || before.desktop || editing || before.editing || !hasQueue || !before.hasQueue ||
      !enabled || section.closest('[data-play-input="keyboard"]') || typeof section.animate !== "function") return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reduced = media.matches;
    section.hidden = false;
    if (open && frames.size === 0) section.scrollTop = 0;
    const full = section.getBoundingClientRect();
    const mini = launcher.getBoundingClientRect();
    if (!full.width || !full.height || !mini.width || !mini.height) {
      section.hidden = !open;
      return;
    }
    const animations: ReturnType<typeof waapi.animate>[] = [];
    const elements: HTMLElement[] = [];
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      animations.forEach(animation => animation.revert());
      delete section.dataset.transitioning;
      delete launcher.dataset.transitioning;
      section.hidden = !open;
      window.removeEventListener("resize", finish);
      media.removeEventListener("change", finish);
      if (active.current?.finish === finish) active.current = null;
    };
    active.current = { elements, finish };
    section.dataset.transitioning = "true";
    launcher.dataset.transitioning = "true";
    window.addEventListener("resize", finish);
    media.addEventListener("change", finish);

    const duration = reduced ? 160 : 280;
    if (!reduced) {
      const compactClip = `inset(${mini.top - full.top}px ${full.right - mini.right}px ${full.bottom - mini.bottom}px ${mini.left - full.left}px round ${getComputedStyle(launcher).borderRadius})`;
      // Text keeps its aspect ratio, and both names follow the surface's timing.
      for (const key of ["title", "participants"]) {
        const text = section.querySelector<HTMLElement>(`[data-player-hero="${key}"]`);
        const compactText = launcher.querySelector<HTMLElement>(`[data-player-hero="${key}"]`);
        if (!text || !compactText) continue;
        const from = compactText.getBoundingClientRect();
        const to = text.getBoundingClientRect();
        const scale = parseFloat(getComputedStyle(compactText).fontSize) / parseFloat(getComputedStyle(text).fontSize);
        const compactTransform = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${scale})`;
        const compactTextClip = `inset(0px ${Math.max(0, to.width - from.width / scale)}px 0px 0px)`;
        elements.push(text);
        animations.push(waapi.animate(text, {
          transform: [frames.get(text)?.transform ?? (open ? compactTransform : "none"), open ? "none" : compactTransform],
          clipPath: [frames.get(text)?.clipPath ?? (open ? compactTextClip : "inset(0px 0px 0px 0px)"), open ? "inset(0px 0px 0px 0px)" : compactTextClip],
          duration, ease,
        }));
      }
      section.querySelectorAll<HTMLElement>("[data-player-enter]").forEach((element, index) => {
        elements.push(element);
        animations.push(waapi.animate(element, {
          opacity: [frames.get(element)?.opacity ?? (open ? 0 : 1), open ? 1 : 0],
          transform: [frames.get(element)?.transform ?? (open ? "translateY(8px)" : "none"), open ? "none" : "translateY(8px)"],
          duration: open ? 160 : 125, delay: open && frames.size === 0 ? Math.min(index, 3) * 30 : 0, ease: entranceEase,
        }));
      });
      elements.push(section);
      animations.push(waapi.animate(section, {
        clipPath: [frames.get(section)?.clipPath ?? (open ? compactClip : expandedClip), open ? expandedClip : compactClip],
        duration, ease, onComplete: finish,
      }));
    } else {
      elements.push(section);
      animations.push(waapi.animate(section, {
        opacity: [frames.get(section)?.opacity ?? (open ? 0 : 1), open ? 1 : 0],
        duration, ease: entranceEase, onComplete: finish,
      }));
    }
  }, [sectionRef, open, desktop, editing, hasQueue, trackId, enabled]);

  useLayoutEffect(() => () => active.current?.finish(), []);
  return launcherRef;
}
